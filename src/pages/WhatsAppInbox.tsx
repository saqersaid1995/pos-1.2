import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow, format } from "date-fns";
import {
  MessageCircle, User, Package, Search, ArrowLeft, ExternalLink,
  Send, Loader2, Trash2, Image as ImageIcon, FileText, Mic, AlertCircle,
  Paperclip, Camera, X, Receipt, CheckCircle2, BellRing, Zap, Circle, ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatOMR } from "@/lib/currency";

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

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Strip "[Template: xxx]" prefix and clean templated text into a plain message. */
function cleanMessage(text: string): string {
  if (!text) return "";
  return text
    .replace(/^\[Template:\s*[^\]]+\]\s*/i, "")
    .replace(/\{\{\s*\d+\s*\}\}/g, "")
    .trim();
}

/** Detect "[Order: ORD-XXXX]" or order_id reference inside a message body. */
function extractOrderRef(text: string): string | null {
  if (!text) return null;
  const m = text.match(/ORD-\d{3,}/i);
  return m ? m[0].toUpperCase() : null;
}

export default function WhatsAppInbox() {
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [customers, setCustomers] = useState<Record<string, { id: string; name: string; phone: string }>>({});
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [latestOrder, setLatestOrder] = useState<any>(null);
  const [orderRefs, setOrderRefs] = useState<Record<string, any>>({});
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [imageCaption, setImageCaption] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const prevMsgCountRef = useRef<number>(0);
  const prevPhoneRef = useRef<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { role: userRole } = useAuth();

  // Fetch
  useEffect(() => {
    async function load() {
      setLoading(true);
      const [msgRes, custRes] = await Promise.all([
        supabase.from("whatsapp_messages").select("*").eq("is_deleted", false).order("created_at", { ascending: true }),
        supabase.from("customers").select("id, full_name, phone_number").eq("is_active", true),
      ]);
      if (msgRes.data) setMessages(msgRes.data as WaMessage[]);
      if (custRes.data) {
        const map: Record<string, { id: string; name: string; phone: string }> = {};
        for (const c of custRes.data) {
          const digits = c.phone_number.replace(/\D/g, "");
          map[digits] = { id: c.id, name: c.full_name, phone: c.phone_number };
          if (digits.length === 8) map["968" + digits] = { id: c.id, name: c.full_name, phone: c.phone_number };
        }
        setCustomers(map);
      }
      setLoading(false);
    }
    load();
  }, []);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("whatsapp-inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_messages" },
        (payload) => setMessages((prev) => [...prev, payload.new as WaMessage]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "whatsapp_messages" },
        (payload) => setMessages((prev) => prev.map((m) => m.id === (payload.new as WaMessage).id ? (payload.new as WaMessage) : m)))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Build conversations
  const conversations = useMemo(() => {
    const map = new Map<string, Conversation>();
    for (const msg of messages) {
      if (!map.has(msg.phone)) {
        const cust = customers[msg.phone] || customers[msg.phone.slice(-8)] || null;
        map.set(msg.phone, {
          phone: msg.phone,
          customerName: cust?.name || null,
          customerId: cust?.id || msg.customer_id || null,
          lastMessage: msg.message,
          lastTime: msg.created_at,
          messages: [],
          unreadCount: 0,
        });
      }
      const conv = map.get(msg.phone)!;
      conv.messages.push(msg);
      conv.lastMessage = msg.message;
      conv.lastTime = msg.created_at;
      if (msg.type === "incoming" && !msg.is_read) conv.unreadCount++;
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime());
  }, [messages, customers]);

  const filteredConversations = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((c) => c.phone.includes(q) || c.customerName?.toLowerCase().includes(q));
  }, [conversations, search]);

  const selectedConversation = conversations.find((c) => c.phone === selectedPhone);

  // Mark read
  useEffect(() => {
    if (!selectedConversation) return;
    const unreadIds = selectedConversation.messages.filter((m) => m.type === "incoming" && !m.is_read).map((m) => m.id);
    if (!unreadIds.length) return;
    setMessages((prev) => prev.map((m) => unreadIds.includes(m.id) ? { ...m, is_read: true } : m));
    supabase.from("whatsapp_messages").update({ is_read: true } as any).in("id", unreadIds).then(({ error }) => {
      if (error) console.error(error);
    });
  }, [selectedPhone, selectedConversation?.messages.length]);

  // Latest order for header
  useEffect(() => {
    if (!selectedConversation?.customerId) { setLatestOrder(null); return; }
    supabase.from("orders")
      .select("id, order_number, current_status, total_amount, remaining_amount, payment_status")
      .eq("customer_id", selectedConversation.customerId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle()
      .then(({ data }) => setLatestOrder(data));
  }, [selectedConversation?.customerId]);

  // Resolve order refs found in messages (for order cards inside chat)
  useEffect(() => {
    if (!selectedConversation) return;
    const refs = new Set<string>();
    for (const m of selectedConversation.messages) {
      const r = extractOrderRef(m.message);
      if (r && !orderRefs[r]) refs.add(r);
    }
    if (!refs.size) return;
    supabase.from("orders")
      .select("id, order_number, current_status, total_amount, remaining_amount, payment_status")
      .in("order_number", Array.from(refs))
      .then(({ data }) => {
        if (!data) return;
        setOrderRefs((prev) => {
          const next = { ...prev };
          for (const o of data) next[o.order_number] = o;
          return next;
        });
      });
  }, [selectedConversation?.messages.length]);

  // Smart scroll: jump to bottom on conversation open; otherwise only auto-scroll
  // when user is already near bottom OR they sent the message themselves.
  useEffect(() => {
    if (!selectedConversation) {
      prevMsgCountRef.current = 0;
      prevPhoneRef.current = null;
      setNewMessagesCount(0);
      return;
    }
    const count = selectedConversation.messages.length;
    const phoneChanged = prevPhoneRef.current !== selectedConversation.phone;

    if (phoneChanged) {
      // Opening a conversation: jump instantly to bottom (no smooth scroll)
      prevPhoneRef.current = selectedConversation.phone;
      prevMsgCountRef.current = count;
      setNewMessagesCount(0);
      requestAnimationFrame(() => {
        const el = messagesScrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
        setIsAtBottom(true);
      });
      return;
    }

    if (count > prevMsgCountRef.current) {
      const lastMsg = selectedConversation.messages[count - 1];
      const isOwn = lastMsg?.type === "outgoing";
      if (isOwn || isAtBottom) {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        setNewMessagesCount(0);
      } else {
        setNewMessagesCount((n) => n + (count - prevMsgCountRef.current));
      }
      prevMsgCountRef.current = count;
    }
  }, [selectedConversation?.messages.length, selectedConversation?.phone]);

  // Track scroll position to know whether user is at bottom
  const handleMessagesScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 60;
    setIsAtBottom(atBottom);
    if (atBottom && newMessagesCount > 0) setNewMessagesCount(0);
  };

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setNewMessagesCount(0);
  };

  useEffect(() => { if (selectedPhone) setTimeout(() => replyInputRef.current?.focus(), 100); }, [selectedPhone]);

  const formatPhone = (p: string) => p.length === 11 && p.startsWith("968") ? `+${p.slice(0, 3)} ${p.slice(3)}` : p;

  // Online / last seen indicator (based on most recent incoming msg in last 5 minutes)
  const onlineStatus = useMemo(() => {
    if (!selectedConversation) return null;
    const incoming = [...selectedConversation.messages].reverse().find((m) => m.type === "incoming");
    if (!incoming) return { online: false, label: "No activity yet" };
    const ts = new Date(incoming.message_timestamp || incoming.created_at).getTime();
    const diff = Date.now() - ts;
    if (diff < 5 * 60 * 1000) return { online: true, label: "Online" };
    return { online: false, label: `Last seen ${formatDistanceToNow(new Date(ts), { addSuffix: true })}` };
  }, [selectedConversation]);

  const handleSend = async () => {
    if (!replyText.trim() || !selectedPhone || sending) return;
    const text = replyText.trim();
    setReplyText("");
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-text", {
        body: { phone: selectedPhone, message: text, customer_id: selectedConversation?.customerId || null },
      });
      if (error) throw error;
      if (data?.success) toast.success("Message sent");
      else toast.error(data?.error || "Failed to send");
    } catch (e) {
      console.error(e);
      toast.error("Failed to send message");
    } finally {
      setSending(false);
      replyInputRef.current?.focus();
    }
  };

  const sendQuickAction = async (text: string) => {
    if (!selectedPhone || sending) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-text", {
        body: { phone: selectedPhone, message: text, customer_id: selectedConversation?.customerId || null },
      });
      if (error) throw error;
      if (data?.success) toast.success("Sent");
      else toast.error(data?.error || "Failed to send");
    } catch {
      toast.error("Failed to send");
    } finally { setSending(false); }
  };

  // Image upload handlers
  const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) { toast.error("Only JPEG, PNG, WebP allowed"); return; }
    if (file.size > MAX_IMAGE_SIZE) { toast.error("Image must be under 5MB"); return; }
    setPendingImage(file);
    setImageCaption("");
    setPendingImagePreview(URL.createObjectURL(file));
    e.target.value = "";
  };
  const clearPendingImage = () => {
    if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
    setPendingImage(null); setPendingImagePreview(null); setImageCaption("");
  };
  const handleSendImage = async () => {
    if (!pendingImage || !selectedPhone || sending) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append("phone", selectedPhone);
      formData.append("image", pendingImage);
      if (imageCaption.trim()) formData.append("caption", imageCaption.trim());
      if (selectedConversation?.customerId) formData.append("customer_id", selectedConversation.customerId);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || anonKey;

      const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
        body: formData,
      });
      const data = await res.json();
      if (data?.success) { toast.success("Image sent"); clearPendingImage(); }
      else toast.error(data?.error || "Failed to send image");
    } catch {
      toast.error("Failed to send image");
    } finally { setSending(false); }
  };

  const handleDeleteConversation = async (phone: string) => {
    const ids = messages.filter((m) => m.phone === phone).map((m) => m.id);
    if (!ids.length) return;
    const { error } = await supabase.from("whatsapp_messages").update({ is_deleted: true } as any).in("id", ids);
    if (error) { toast.error("Failed to delete conversation"); return; }
    setMessages((prev) => prev.filter((m) => m.phone !== phone));
    if (selectedPhone === phone) setSelectedPhone(null);
    toast.success("Conversation deleted");
  };

  const showConversationList = !isMobile || !selectedPhone;
  const showChatView = !isMobile || !!selectedPhone;

  // ─── Message bubble renderer ───
  const renderMessageContent = (msg: WaMessage) => {
    if (msg.message_type === "image") {
      return (
        <div>
          {msg.media_url ? (
            <button onClick={() => setPreviewImage(msg.media_url)} className="block">
              <img src={msg.media_url} alt="Shared" className="rounded-lg max-w-[240px] max-h-[240px] object-cover" loading="lazy" />
            </button>
          ) : (
            <div className="flex items-center gap-2 text-xs opacity-70 p-2 bg-background/40 rounded">
              <ImageIcon className="h-4 w-4" /><span>Image expired</span>
            </div>
          )}
          {msg.message && msg.message !== "[Image]" && (
            <p className="whitespace-pre-wrap break-words text-sm mt-1">{cleanMessage(msg.message)}</p>
          )}
        </div>
      );
    }
    if (msg.message_type === "audio") {
      return (
        <div className="flex items-center gap-2 py-1">
          <Mic className="h-4 w-4 shrink-0" />
          {msg.media_url ? <audio controls preload="none" className="h-8 max-w-[220px]"><source src={msg.media_url} /></audio>
            : <span className="text-xs opacity-70">Voice note expired</span>}
        </div>
      );
    }
    if (msg.message_type === "document") {
      return (
        <div className="flex items-center gap-2 py-1">
          <FileText className="h-4 w-4 shrink-0" />
          {msg.media_url ? <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="text-sm underline truncate max-w-[200px]">{msg.filename || "Document"}</a>
            : <span className="text-sm">{msg.filename || "Document"} <span className="text-xs opacity-70">(expired)</span></span>}
        </div>
      );
    }

    const cleaned = cleanMessage(msg.message);
    const orderRef = extractOrderRef(msg.message);
    const order = orderRef ? orderRefs[orderRef] : null;

    return (
      <>
        {cleaned && <p className="whitespace-pre-wrap break-words text-sm">{cleaned}</p>}
        {order && (
          <div className="mt-2 rounded-lg border border-border/60 bg-background/70 text-foreground p-2.5 min-w-[220px]">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-mono font-semibold">{order.order_number}</span>
              <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 capitalize">{order.current_status?.replace(/-/g, " ")}</Badge>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span>Total {formatOMR(order.total_amount)}</span>
              {order.remaining_amount > 0 && <span className="text-warning font-medium">Due {formatOMR(order.remaining_amount)}</span>}
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs w-full gap-1" onClick={() => navigate(`/order/${order.id}`)}>
              <ExternalLink className="h-3 w-3" /> Open Order
            </Button>
          </div>
        )}
      </>
    );
  };

  // Last-message preview text for sidebar (clean, no template tags)
  const previewText = (msg: WaMessage): string => {
    if (msg.message_type === "image") return "📷 Photo";
    if (msg.message_type === "audio") return "🎤 Voice note";
    if (msg.message_type === "document") return "📄 Document";
    return cleanMessage(msg.message) || msg.message;
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <AppHeader title="Inbox" />

      <div className="flex-1 flex overflow-hidden w-full">
        {/* ─── SIDEBAR (30%) ─── */}
        {showConversationList && (
          <aside className={cn(
            "border-r border-border flex flex-col bg-card/30",
            isMobile ? "w-full" : "w-[30%] min-w-[300px] max-w-[420px] shrink-0"
          )}>
            <div className="px-4 py-3 border-b border-border bg-card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold">Conversations</h2>
                <Badge variant="secondary" className="text-[10px]">{conversations.length}</Badge>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              {loading ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
              ) : filteredConversations.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <MessageCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No conversations</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {filteredConversations.map((conv) => {
                    const isSelected = selectedPhone === conv.phone;
                    const isUnread = conv.unreadCount > 0;
                    const lastMsg = conv.messages[conv.messages.length - 1];
                    return (
                      <button
                        key={conv.phone}
                        onClick={() => { setSelectedPhone(conv.phone); setReplyText(""); }}
                        className={cn(
                          "w-full text-left rounded-lg px-3 py-2.5 transition-colors border",
                          isSelected
                            ? "bg-primary/10 border-primary/30"
                            : isUnread
                            ? "bg-primary/5 border-transparent hover:bg-accent/60"
                            : "border-transparent hover:bg-accent/50"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            "h-10 w-10 rounded-full flex items-center justify-center shrink-0 font-semibold text-sm",
                            isUnread ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                          )}>
                            {(conv.customerName || conv.phone).slice(0, 1).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className={cn("text-sm truncate", isUnread ? "font-bold" : "font-medium")}>
                                {conv.customerName || formatPhone(conv.phone)}
                              </span>
                              <span className={cn(
                                "text-[10px] shrink-0",
                                isUnread ? "text-primary font-semibold" : "text-muted-foreground"
                              )}>
                                {formatDistanceToNow(new Date(conv.lastTime), { addSuffix: false })}
                              </span>
                            </div>
                            {conv.customerName && (
                              <p className="text-[11px] text-muted-foreground truncate">{formatPhone(conv.phone)}</p>
                            )}
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <p className={cn(
                                "text-xs truncate",
                                isUnread ? "text-foreground font-medium" : "text-muted-foreground"
                              )}>
                                {lastMsg.type === "outgoing" && <span className="opacity-60">You: </span>}
                                {previewText(lastMsg)}
                              </p>
                              {isUnread && (
                                <Badge className="h-5 min-w-[20px] px-1.5 text-[10px] bg-primary text-primary-foreground shrink-0">
                                  {conv.unreadCount}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </aside>
        )}

        {/* ─── CHAT (70%) ─── */}
        {showChatView && (
          <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-muted/20">
            {selectedConversation ? (
              <>
                {/* Chat header */}
                <div className="px-4 py-2.5 border-b border-border bg-card flex items-center gap-3 shadow-sm">
                  {isMobile && (
                    <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 -ml-1" onClick={() => setSelectedPhone(null)}>
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                  )}
                  <div className="relative shrink-0">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary">
                      {(selectedConversation.customerName || selectedConversation.phone).slice(0, 1).toUpperCase()}
                    </div>
                    {onlineStatus?.online && (
                      <Circle className="absolute -bottom-0.5 -right-0.5 h-3 w-3 fill-success text-success bg-card rounded-full" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate leading-tight">
                      {selectedConversation.customerName || formatPhone(selectedConversation.phone)}
                    </p>
                    <p className={cn(
                      "text-[11px] leading-tight mt-0.5",
                      onlineStatus?.online ? "text-success font-medium" : "text-muted-foreground"
                    )}>
                      {onlineStatus?.label || formatPhone(selectedConversation.phone)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {selectedConversation.customerId && (
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
                        onClick={() => navigate(`/customer/${selectedConversation.customerId}`)}>
                        <User className="h-3.5 w-3.5" /> Profile
                      </Button>
                    )}
                    {latestOrder && (
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
                        onClick={() => navigate(`/order/${latestOrder.id}`)}>
                        <Package className="h-3.5 w-3.5" /> Orders
                      </Button>
                    )}
                    {userRole === "admin" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove this conversation from the inbox.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteConversation(selectedConversation.phone)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>

                {/* Messages */}
                <div className="relative flex-1 min-h-0">
                  <div
                    ref={messagesScrollRef}
                    onScroll={handleMessagesScroll}
                    className="absolute inset-0 overflow-y-auto overscroll-contain"
                    style={{ WebkitOverflowScrolling: "touch" }}
                  >
                    <div className="px-4 py-4 space-y-1.5 max-w-[760px] mx-auto">
                      {selectedConversation.messages.map((msg, i) => {
                        const prev = selectedConversation.messages[i - 1];
                        const showDateSep = !prev || format(new Date(prev.created_at), "yyyy-MM-dd") !== format(new Date(msg.created_at), "yyyy-MM-dd");
                        const isOutgoing = msg.type === "outgoing";
                        return (
                          <div key={msg.id}>
                            {showDateSep && (
                              <div className="flex items-center justify-center my-3">
                                <span className="text-[10px] text-muted-foreground bg-card border border-border px-3 py-1 rounded-full font-medium">
                                  {format(new Date(msg.created_at), "MMM d, yyyy")}
                                </span>
                              </div>
                            )}
                            <div className={cn("flex", isOutgoing ? "justify-end" : "justify-start")}>
                              <div className={cn(
                                "max-w-[78%] rounded-2xl px-3 py-2 shadow-sm",
                                isOutgoing
                                  ? "bg-primary text-primary-foreground rounded-br-md"
                                  : "bg-card border border-border rounded-bl-md"
                              )}>
                                {renderMessageContent(msg)}
                                <div className={cn("flex items-center gap-1 mt-0.5 justify-end")}>
                                  <span className={cn(
                                    "text-[10px] leading-none",
                                    isOutgoing ? "text-primary-foreground/70" : "text-muted-foreground"
                                  )}>
                                    {format(new Date(msg.message_timestamp || msg.created_at), "HH:mm")}
                                  </span>
                                  {isOutgoing && msg.send_status === "failed" && (
                                    <AlertCircle className="h-3 w-3 text-destructive" />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={chatEndRef} />
                    </div>
                  </div>

                  {/* "New messages ↓" floating button */}
                  {!isAtBottom && (
                    <button
                      onClick={scrollToBottom}
                      className={cn(
                        "absolute bottom-3 left-1/2 -translate-x-1/2 z-10",
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-lg",
                        "bg-primary text-primary-foreground text-xs font-medium",
                        "hover:bg-primary/90 transition-colors animate-in fade-in slide-in-from-bottom-2"
                      )}
                    >
                      {newMessagesCount > 0 ? `${newMessagesCount} new message${newMessagesCount > 1 ? "s" : ""}` : "Jump to latest"}
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Quick actions bar */}
                <div className="border-t border-border bg-card px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mr-1 shrink-0">
                    <Zap className="h-3 w-3 inline mr-1" />Quick
                  </span>
                  {latestOrder && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0"
                      disabled={sending}
                      onClick={() => sendQuickAction(`Your invoice for order ${latestOrder.order_number}: Total ${formatOMR(latestOrder.total_amount)}${latestOrder.remaining_amount > 0 ? `, remaining ${formatOMR(latestOrder.remaining_amount)}` : " (paid in full)"}.`)}>
                      <Receipt className="h-3 w-3" /> Send Invoice
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0"
                    disabled={sending}
                    onClick={() => sendQuickAction("Your order is ready for pickup. Please visit us at your convenience. Thank you!")}>
                    <CheckCircle2 className="h-3 w-3" /> Order Ready
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0"
                    disabled={sending}
                    onClick={() => sendQuickAction(latestOrder && latestOrder.remaining_amount > 0
                      ? `Friendly reminder: order ${latestOrder.order_number} has a remaining balance of ${formatOMR(latestOrder.remaining_amount)}.`
                      : "Friendly reminder regarding your outstanding balance with us.")}>
                    <BellRing className="h-3 w-3" /> Payment Reminder
                  </Button>
                </div>

                {/* Pending image preview */}
                {pendingImagePreview && (
                  <div className="border-t border-border bg-card px-3 pt-2 pb-1">
                    <div className="flex items-start gap-2 max-w-[760px] mx-auto">
                      <div className="relative">
                        <img src={pendingImagePreview} alt="Preview" className="h-20 w-20 object-cover rounded-lg border border-border" />
                        <button onClick={clearPendingImage}
                          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <input type="text" placeholder="Add a caption..." value={imageCaption}
                        onChange={(e) => setImageCaption(e.target.value)}
                        className="flex-1 text-sm bg-transparent border-none outline-none placeholder:text-muted-foreground py-2"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSendImage(); } }} />
                    </div>
                  </div>
                )}

                {/* Composer */}
                <div className="border-t border-border bg-card p-2.5">
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageSelected} />
                  <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageSelected} />

                  <div className="flex items-end gap-1.5 max-w-[760px] mx-auto">
                    {!pendingImage && (
                      <>
                        <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground"
                          onClick={() => fileInputRef.current?.click()} disabled={sending} title="Attach image">
                          <Paperclip className="h-5 w-5" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground"
                          onClick={() => cameraInputRef.current?.click()} disabled={sending} title="Take photo">
                          <Camera className="h-5 w-5" />
                        </Button>
                      </>
                    )}

                    {pendingImage ? (
                      <div className="flex-1" />
                    ) : (
                      <textarea
                        ref={replyInputRef}
                        placeholder="Type a message..."
                        value={replyText}
                        onChange={(e) => {
                          setReplyText(e.target.value);
                          const ta = e.target;
                          ta.style.height = "auto";
                          ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        disabled={sending}
                        rows={1}
                        className="flex-1 resize-none rounded-2xl border border-input bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-h-[120px] leading-snug"
                        style={{ minHeight: "40px" }}
                      />
                    )}

                    <Button type="button" size="icon" className="h-10 w-10 shrink-0 rounded-full"
                      disabled={pendingImage ? sending : (!replyText.trim() || sending)}
                      onClick={pendingImage ? handleSendImage : handleSend}>
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" />
                        : pendingImage ? <ImageIcon className="h-4 w-4" />
                        : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              /* Empty state */
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center max-w-sm">
                  <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <MessageCircle className="h-10 w-10 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1">Select a conversation</h3>
                  <p className="text-sm text-muted-foreground">
                    Choose a customer from the list to view messages, send replies, and use quick actions like sending invoices or pickup notifications.
                  </p>
                </div>
              </div>
            )}
          </main>
        )}
      </div>

      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-2">
          {previewImage && <img src={previewImage} alt="Media" className="w-full h-full object-contain rounded" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
