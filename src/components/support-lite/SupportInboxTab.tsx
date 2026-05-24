import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow, format } from "date-fns";
import {
  MessageCircle, User, Search, ArrowLeft, Send, Loader2,
  Image as ImageIcon, FileText, Mic, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ChatView from "./ChatView";
import { useBadgeCount } from "@/hooks/useBadgeCount";

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

export default function SupportInboxTab() {
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [customers, setCustomers] = useState<Record<string, { id: string; name: string; phone: string }>>({});
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const { updateBadge } = useBadgeCount();

  const loadMessages = useCallback(async () => {
    setLoading(true);
    const [msgRes, custRes] = await Promise.all([
      supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("is_deleted", false)
        .order("created_at", { ascending: true }),
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
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Refresh messages when app returns to foreground
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadMessages();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [loadMessages]);

  useEffect(() => {
    const channel = supabase
      .channel("support-inbox-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_messages" }, (payload) => {
        setMessages((prev) => [...prev, payload.new as WaMessage]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "whatsapp_messages" }, (payload) => {
        setMessages((prev) => prev.map((m) => m.id === (payload.new as WaMessage).id ? (payload.new as WaMessage) : m));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "whatsapp_messages" }, (payload) => {
        setMessages((prev) => prev.filter((m) => m.id !== (payload.old as any).id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

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
    const arr = Array.from(map.values());
    arr.sort((a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime());
    return arr;
  }, [messages, customers]);

  const filteredConversations = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((c) => c.phone.includes(q) || c.customerName?.toLowerCase().includes(q));
  }, [conversations, search]);

  const selectedConversation = conversations.find((c) => c.phone === selectedPhone);

  // Mark as read
  useEffect(() => {
    if (!selectedConversation) return;
    const unreadIds = selectedConversation.messages.filter((m) => m.type === "incoming" && !m.is_read).map((m) => m.id);
    if (!unreadIds.length) return;
    setMessages((prev) => prev.map((m) => (unreadIds.includes(m.id) ? { ...m, is_read: true } : m)));
    supabase.from("whatsapp_messages").update({ is_read: true } as any).in("id", unreadIds).then(() => {
      updateBadge();
    });
  }, [selectedPhone, selectedConversation?.messages.length]);

  const handleNewMessage = useCallback(() => {
    // Messages arrive via realtime, no extra action needed
  }, []);

  const formatPhone = (phone: string) => {
    if (phone.length === 11 && phone.startsWith("968")) return `+${phone.slice(0, 3)} ${phone.slice(3)}`;
    return phone;
  };

  // Chat view (full-screen takeover)
  if (selectedPhone && selectedConversation) {
    return (
      <ChatView
        conversation={selectedConversation}
        onBack={() => setSelectedPhone(null)}
        onMessageSent={handleNewMessage}
        formatPhone={formatPhone}
      />
    );
  }

  // Conversation list
  return (
    <div className="flex-1 flex flex-col">
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10 text-base" />
        </div>
      </div>
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <MessageCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>No messages yet</p>
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <button
              key={conv.phone}
              onClick={() => setSelectedPhone(conv.phone)}
              className={cn(
                "w-full text-left px-4 py-3 border-b border-border/50 hover:bg-accent/50 transition-colors",
                conv.unreadCount > 0 && "bg-primary/5"
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn("h-9 w-9 rounded-full flex items-center justify-center shrink-0 mt-0.5", conv.unreadCount > 0 ? "bg-primary/20" : "bg-primary/10")}>
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={cn("text-sm truncate", conv.unreadCount > 0 ? "font-bold" : "font-medium")}>
                      {conv.customerName || formatPhone(conv.phone)}
                    </span>
                    <span className={cn("text-[10px] shrink-0 ml-2", conv.unreadCount > 0 ? "text-primary font-semibold" : "text-muted-foreground")}>
                      {formatDistanceToNow(new Date(conv.lastTime), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className={cn("text-xs truncate", conv.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
                      {conv.lastMessage}
                    </p>
                    {conv.unreadCount > 0 && (
                      <Badge className="ml-2 h-5 min-w-[20px] px-1.5 text-[10px] bg-primary text-primary-foreground shrink-0">
                        {conv.unreadCount}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))
        )}
      </ScrollArea>
    </div>
  );
}
