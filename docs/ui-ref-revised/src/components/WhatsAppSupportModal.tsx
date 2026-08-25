import React, { useState } from 'react';
import { X, Send, MessageCircle, Bot, CheckCheck, Clock, ShieldCheck, User } from 'lucide-react';

interface WhatsAppSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  timestamp: string;
}

export const WhatsAppSupportModal: React.FC<WhatsAppSupportModalProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      sender: 'bot',
      text: 'Salam! Welcome to Aheed Food Centre WhatsApp Support. How can we help you today with your fresh halal meat, groceries, or delivery order in Milton Keynes?',
      timestamp: 'Just now',
    },
  ]);
  const [inputValue, setInputValue] = useState('');

  if (!isOpen) return null;

  const quickQuestions = [
    'Is your meat 100% Certified HMC Halal?',
    'Can I request custom butcher cuts (e.g. 1-inch curry cut)?',
    'What are your Milton Keynes delivery slots today?',
    'Where is your store located and what are the opening hours?',
  ];

  const handleSend = (textToSend?: string) => {
    const text = textToSend || inputValue;
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputValue('');

    // Simulated Smart Reply
    setTimeout(() => {
      let replyText = 'Thank you for contacting Aheed Food Centre! Our butcher & customer desk will assist you shortly.';

      const lower = text.toLowerCase();
      if (lower.includes('hmc') || lower.includes('halal') || lower.includes('meat')) {
        replyText = '✅ 100% Guaranteed: All our meat & poultry is certified by HMC (Halal Monitoring Committee UK) and stun-free hand slaughtered. Our master butchers cut fresh daily!';
      } else if (lower.includes('cut') || lower.includes('curry cut') || lower.includes('prep') || lower.includes('custom')) {
        replyText = '🥩 Yes! You can select specific cuts (curry cut with bone, boneless cubes, fine keema, chops) directly in the product view or type your exact instructions in the custom butcher note box.';
      } else if (lower.includes('delivery') || lower.includes('slot') || lower.includes('milton keynes')) {
        replyText = '🚚 We deliver across Milton Keynes (MK1–MK19) with 3 daily slots: 1pm-4pm, 5pm-7pm, and 7pm-9pm. Free delivery on orders over £35!';
      } else if (lower.includes('location') || lower.includes('hours') || lower.includes('store') || lower.includes('open')) {
        replyText = '📍 We are located at 42 Midsummer Boulevard, Central Milton Keynes, MK9 3BP. Open Monday-Saturday 8am-9pm and Sunday 9am-7pm.';
      }

      const botReply: ChatMessage = {
        id: `b-${Date.now()}`,
        sender: 'bot',
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botReply]);
    }, 600);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-[#075E54] rounded-3xl shadow-2xl overflow-hidden border border-emerald-800 flex flex-col h-[520px] max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* WhatsApp Header */}
        <div className="p-4 bg-[#075E54] text-white flex items-center justify-between shadow-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-emerald-700 border-2 border-emerald-400 flex items-center justify-center font-bold text-sm">
                A
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-[#075E54] rounded-full" />
            </div>
            <div>
              <h3 className="font-bold text-sm leading-snug">Aheed Food Centre Store Support</h3>
              <p className="text-[11px] text-emerald-200 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Online • Master Butcher & Customer Desk
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-emerald-800 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chat Body */}
        <div className="flex-1 bg-[#ECE5DD] p-4 overflow-y-auto space-y-3 text-xs">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[82%] p-3 rounded-2xl shadow-xs leading-relaxed ${
                  m.sender === 'user'
                    ? 'bg-[#DCF8C6] text-slate-900 rounded-tr-none'
                    : 'bg-white text-slate-800 rounded-tl-none'
                }`}
              >
                <p>{m.text}</p>
                <div className="flex items-center justify-end gap-1 text-[9px] text-slate-400 mt-1">
                  <span>{m.timestamp}</span>
                  {m.sender === 'user' && <CheckCheck className="w-3 h-3 text-emerald-600" />}
                </div>
              </div>
            </div>
          ))}

          {/* Quick Question Chips */}
          <div className="pt-2 space-y-1.5">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Quick Questions:
            </div>
            <div className="flex flex-col gap-1.5">
              {quickQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleSend(q)}
                  className="text-left text-[11px] bg-white/90 hover:bg-white text-slate-700 hover:text-emerald-900 p-2 rounded-xl border border-slate-200/80 shadow-2xs transition-colors"
                >
                  💬 {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Input Footer */}
        <div className="p-3 bg-[#F0F2F5] border-t border-slate-200 flex items-center gap-2 shrink-0">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type your message to Aheed team..."
            className="flex-1 bg-white text-xs px-3.5 py-2 rounded-full border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
          <button
            type="button"
            onClick={() => handleSend()}
            className="w-9 h-9 rounded-full bg-[#128C7E] hover:bg-[#075E54] text-white flex items-center justify-center transition-colors shadow-xs"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
