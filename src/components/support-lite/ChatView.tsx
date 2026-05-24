import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import {
  User, ArrowLeft, Send, Loader2,
  Image as ImageIcon, FileText, Mic, AlertCircle,
  Paperclip, X, Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface WaMessage {
  id: string;
  phone: string;
  message: string;
  type: string;
  message_type: string;
  media_id: string | null;
  media_url: string | null;
  filename: string | null;
  customer_id: string | null;
  order_id: string | null;
  wa_message_id: string | null;
  message_timestamp: string | null;
  created_at: string;
  is_deleted: boolean;
  send_status: string;
  is_read: boolean;
}

interface Conversation {
  phone: string;
  customerName: string | null;
  customerId: string | null;
  lastMessage: string;
  lastTime: string;
  messages: WaMessage[];
  unreadCount: number;
}

interface ChatViewProps {
  conversation: Conversation;
  onBack: () => void;
  onMessageSent: () => void;
  formatPhone: (phone: string) => string;
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ChatView({ conversation, onBack, onMessageSent, formatPhone }: ChatViewProps) {
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [imageCaption, setImageCaption] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on mount and new messages
  useEffect(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation.messages.length]);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 200);
  }, []);

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setReplyText(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  };

  // Image selection handler
  const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Only JPEG, PNG, and WebP images are allowed");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      toast.error("Image too large. Maximum 5MB");
      return;
    }

    setPendingImage(file);
    setImageCaption("");
    const url = URL.createObjectURL(file);
    setPendingImagePreview(url);

    // Reset file input so same file can be re-selected
    e.target.value = "";
  };

  const clearPendingImage = () => {
    if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
    setPendingImage(null);
    setPendingImagePreview(null);
    setImageCaption("");
  };

  const handleSendImage = async () => {
    if (!pendingImage || sending) return;
    setSending(true);

    try {
      const formData = new FormData();
      formData.append("phone", conversation.phone);
      formData.append("image", pendingImage);
      if (imageCaption.trim()) formData.append("caption", imageCaption.trim());
      if (conversation.customerId) formData.append("customer_id", conversation.customerId);

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Get current session token
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || anonKey;

      const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-image`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: anonKey,
        },
        body: formData,
      });

      const data = await res.json();
      if (data?.success) {
        toast.success("Image sent");
        clearPendingImage();
        onMessageSent();
      } else {
        toast.error(data?.error || "Failed to send image");
      }
    } catch {
      toast.error("Failed to send image");
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    if (!replyText.trim() || sending) return;
    const text = replyText.trim();
    setReplyText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-text", {
        body: { phone: conversation.phone, message: text, customer_id: conversation.customerId || null },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success("Sent");
        onMessageSent();
      } else {
        toast.error(data?.error || "Failed to send");
      }
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderMessageContent = (msg: WaMessage) => {
    if (msg.message_type === "image") {
      return (
        <div>
          {msg.media_url ? (
            <button onClick={() => setPreviewImage(msg.media_url)} className="block">
              <div className="rounded overflow-hidden mb-1 max-w-[200px]">
                <img src={msg.media_url} alt="Shared image" className="w-full h-auto rounded object-cover max-h-[200px]" loading="lazy" />
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-2 text-xs opacity-70 p-2 bg-muted/30 rounded mb-1">
              <ImageIcon className="h-4 w-4" /><span>Image (media expired)</span>
            </div>
          )}
          {msg.message && msg.message !== "[Image]" && <p className="whitespace-pre-wrap break-words text-sm">{msg.message}</p>}
        </div>
      );
    }
    if (msg.message_type === "audio") {
      return (
        <div className="flex items-center gap-2 py-1">
          <Mic className="h-4 w-4 shrink-0" />
          {msg.media_url ? <audio controls preload="none" className="h-8 max-w-[200px]"><source src={msg.media_url} /></audio>
            : <span className="text-xs opacity-70">Voice note (media expired)</span>}
        </div>
      );
    }
    if (msg.message_type === "document") {
      return (
        <div className="flex items-center gap-2 py-1">
          <FileText className="h-4 w-4 shrink-0" />
          {msg.media_url ? <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="text-sm underline truncate max-w-[180px]">{msg.filename || "Document"}</a>
            : <span className="text-sm">{msg.filename || "Document"} <span className="text-xs opacity-70">(expired)</span></span>}
        </div>
      );
    }
    return <p className="whitespace-pre-wrap break-words text-sm">{msg.message}</p>;
  };

  // Group messages by date
  const groupedMessages: { date: string; msgs: WaMessage[] }[] = [];
  let currentDate = "";
  for (const msg of conversation.messages) {
    const d = format(new Date(msg.message_timestamp || msg.created_at), "yyyy-MM-dd");
    if (d !== currentDate) {
      currentDate = d;
      groupedMessages.push({ date: d, msgs: [] });
    }
    groupedMessages[groupedMessages.length - 1].msgs.push(msg);
  }

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return format(d, "MMM d, yyyy");
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        {/* ─── HEADER ─── */}
        <div className="shrink-0 border-b border-border bg-card px-3 py-2.5 flex items-center gap-3 safe-area-top">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 -ml-1" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate leading-tight">
              {conversation.customerName || formatPhone(conversation.phone)}
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
              {formatPhone(conversation.phone)}
            </p>
          </div>
        </div>

        {/* ─── MESSAGES ─── */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="px-3 py-3 space-y-1 max-w-[700px] mx-auto">
            {groupedMessages.map((group) => (
              <div key={group.date}>
                <div className="flex items-center justify-center my-3">
                  <span className="text-[10px] text-muted-foreground bg-muted/60 px-3 py-1 rounded-full font-medium">
                    {formatDateLabel(group.date)}
                  </span>
                </div>
                {group.msgs.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn("flex mb-1.5", msg.type === "outgoing" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3 py-2 shadow-sm",
                        msg.type === "outgoing"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted rounded-bl-md"
                      )}
                    >
                      {renderMessageContent(msg)}
                      <div className="flex items-center gap-1 mt-0.5">
                        <span
                          className={cn(
                            "text-[10px] leading-none",
                            msg.type === "outgoing" ? "text-primary-foreground/60" : "text-muted-foreground"
                          )}
                        >
                          {format(new Date(msg.message_timestamp || msg.created_at), "HH:mm")}
                        </span>
                        {msg.type === "outgoing" && msg.send_status === "failed" && (
                          <AlertCircle className="h-3 w-3 text-destructive" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ─── IMAGE PREVIEW (above composer) ─── */}
        {pendingImagePreview && (
          <div className="shrink-0 border-t border-border bg-card px-3 pt-2 pb-1">
            <div className="flex items-start gap-2 max-w-[700px] mx-auto">
              <div className="relative">
                <img
                  src={pendingImagePreview}
                  alt="Preview"
                  className="h-20 w-20 object-cover rounded-lg border border-border"
                />
                <button
                  onClick={clearPendingImage}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <input
                type="text"
                placeholder="Add a caption..."
                value={imageCaption}
                onChange={(e) => setImageCaption(e.target.value)}
                className="flex-1 text-sm bg-transparent border-none outline-none placeholder:text-muted-foreground py-2"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSendImage();
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* ─── COMPOSER ─── */}
        <div
          className="shrink-0 border-t border-border bg-card safe-area-bottom"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="flex items-end gap-1.5 px-3 py-2">
            {/* Hidden file inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleImageSelected}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleImageSelected}
            />

            {/* Attachment button */}
            {!pendingImage && (
              <div className="flex shrink-0 gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 text-muted-foreground"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                  title="Attach image"
                >
                  <Paperclip className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 text-muted-foreground"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={sending}
                  title="Take photo"
                >
                  <Camera className="h-5 w-5" />
                </Button>
              </div>
            )}

            {pendingImage ? (
              /* When image is pending, show send image button */
              <div className="flex-1" />
            ) : (
              <textarea
                ref={textareaRef}
                placeholder="Type a message..."
                value={replyText}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                disabled={sending}
                rows={1}
                className={cn(
                  "flex-1 resize-none rounded-2xl border border-input bg-background px-4 py-2.5 text-sm",
                  "ring-offset-background placeholder:text-muted-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  "max-h-[120px] leading-snug"
                )}
                style={{ minHeight: "40px" }}
              />
            )}

            <Button
              type="button"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full"
              disabled={pendingImage ? sending : (!replyText.trim() || sending)}
              onClick={pendingImage ? handleSendImage : handleSend}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : pendingImage ? (
                <ImageIcon className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Image preview dialog */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-2">
          {previewImage && (
            <img src={previewImage} alt="Media" className="w-full h-full object-contain rounded" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
