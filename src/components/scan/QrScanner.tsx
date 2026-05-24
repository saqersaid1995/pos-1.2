import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff } from "lucide-react";

interface QrScannerProps {
  onScan: (code: string) => void;
  scanning: boolean;
  onToggle: () => void;
}

/**
 * Native camera QR/barcode scanner using getUserMedia + BarcodeDetector.
 * Includes workarounds for iOS standalone/PWA mode video rendering bugs.
 */
export default function QrScanner({ onScan, scanning, onToggle }: QrScannerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const [error, setError] = useState<string | null>(null);
  const scannedRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    // Remove video element entirely — iOS standalone mode can cache stale state
    if (videoRef.current && videoRef.current.parentNode) {
      videoRef.current.srcObject = null;
      videoRef.current.load();
      videoRef.current.parentNode.removeChild(videoRef.current);
      videoRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!scanning) {
      stopCamera();
      return;
    }

    scannedRef.current = false;
    setError(null);

    let cancelled = false;

    const startCamera = async () => {
      const hasBarcodeDetector = "BarcodeDetector" in window;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        // Create a fresh video element each time — avoids iOS standalone caching bug
        const video = document.createElement("video");
        video.setAttribute("autoplay", "");
        video.setAttribute("playsinline", "");
        video.setAttribute("muted", "");
        video.setAttribute("webkit-playsinline", "");
        video.muted = true;
        video.playsInline = true;
        video.style.width = "100%";
        video.style.height = "100%";
        video.style.objectFit = "cover";
        video.style.display = "block";

        videoRef.current = video;

        if (containerRef.current) {
          containerRef.current.appendChild(video);
        }

        // Set srcObject AFTER element is in the DOM
        video.srcObject = stream;

        // Wait for metadata before playing — critical for iOS standalone
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Video load timeout")), 8000);
          video.onloadedmetadata = () => {
            clearTimeout(timeout);
            resolve();
          };
          video.onerror = () => {
            clearTimeout(timeout);
            reject(new Error("Video element error"));
          };
        });

        if (cancelled) return;

        await video.play();

        if (hasBarcodeDetector) {
          // Native BarcodeDetector path (Chrome, Android)
          const detector = new (window as any).BarcodeDetector({
            formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8"],
          });

          const scanFrame = async () => {
            if (cancelled || scannedRef.current || !videoRef.current) return;
            if (videoRef.current.readyState < 2) {
              animFrameRef.current = requestAnimationFrame(scanFrame);
              return;
            }
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes.length > 0 && !scannedRef.current) {
                scannedRef.current = true;
                const code = barcodes[0].rawValue;
                stopCamera();
                onScan(code);
                onToggle();
                return;
              }
            } catch {
              // detect() can fail on some frames, continue
            }
            animFrameRef.current = requestAnimationFrame(scanFrame);
          };
          animFrameRef.current = requestAnimationFrame(scanFrame);
        } else {
          // Fallback: html5-qrcode canvas-based decoding (iOS Safari, etc.)
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d")!;

          let html5Qr: any = null;
          try {
            const { Html5Qrcode } = await import("html5-qrcode");
            // html5-qrcode needs a hidden div to exist
            let hiddenDiv = document.getElementById("__html5qr_hidden__");
            if (!hiddenDiv) {
              hiddenDiv = document.createElement("div");
              hiddenDiv.id = "__html5qr_hidden__";
              hiddenDiv.style.display = "none";
              document.body.appendChild(hiddenDiv);
            }
            html5Qr = new Html5Qrcode("__html5qr_hidden__", false);
          } catch (e) {
            console.warn("html5-qrcode init failed, camera will work but scanning disabled:", e);
            setError("QR decoding library unavailable. Use manual entry below.");
            return;
          }

          if (cancelled) return;

          const scanFrame = async () => {
            if (cancelled || scannedRef.current || !videoRef.current) return;
            if (videoRef.current.readyState < 2) {
              animFrameRef.current = requestAnimationFrame(scanFrame);
              return;
            }
            try {
              const vw = videoRef.current.videoWidth;
              const vh = videoRef.current.videoHeight;
              if (vw && vh) {
                canvas.width = vw;
                canvas.height = vh;
                ctx.drawImage(videoRef.current, 0, 0, vw, vh);
                const imageData = canvas.toDataURL("image/jpeg", 0.8);
                try {
                  const blob = await (await fetch(imageData)).blob();
                  const file = new File([blob], "frame.jpg", { type: "image/jpeg" });
                  const result = await html5Qr.scanFileV2(file, false);
                  if (result?.decodedText && !scannedRef.current) {
                    scannedRef.current = true;
                    stopCamera();
                    onScan(result.decodedText);
                    onToggle();
                    return;
                  }
                } catch {
                  // No code found in this frame
                }
              }
            } catch {
              // Canvas errors
            }
            setTimeout(() => {
              animFrameRef.current = requestAnimationFrame(scanFrame);
            }, 250);
          };
          animFrameRef.current = requestAnimationFrame(scanFrame);
        }
      } catch (err: any) {
        if (cancelled) return;
        console.error("Camera error:", err);
        setError("Camera not available. Use manual entry below.");
        onToggle();
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [scanning, onScan, onToggle, stopCamera]);

  return (
    <div className="space-y-3">
      <Button
        variant={scanning ? "destructive" : "default"}
        size="sm"
        className="h-9 text-xs gap-1.5 w-full"
        onClick={onToggle}
      >
        {scanning ? <CameraOff className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
        {scanning ? "Stop Camera" : "Start Camera Scan"}
      </Button>

      <div
        ref={containerRef}
        className={`rounded-lg overflow-hidden bg-secondary ${scanning ? "h-[280px]" : "h-0"}`}
      />

      {error && (
        <p className="text-xs text-destructive text-center">{error}</p>
      )}
    </div>
  );
}
