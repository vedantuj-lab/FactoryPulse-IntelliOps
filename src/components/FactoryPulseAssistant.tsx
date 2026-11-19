import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  X,
  Send,
  Sparkles,
  Bot,
  User as UserIcon,
  ChevronDown,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiFetch } from '../lib/api';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  actionLink?: string;
  actionLabel?: string;
}

export const FactoryPulseAssistant: React.FC = () => {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);

  // Voice Assistant states
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Check SpeechRecognition support
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setSpeechSupported(true);
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = language === 'hi' ? 'hi-IN' : language === 'mr' ? 'mr-IN' : 'en-US';

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputText(transcript);
        setIsListening(false);
        handleSendMessage(transcript);
      };

      rec.onerror = () => {
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }
  }, [language]);

  useEffect(() => {
    if (messages.length === 0) {
      const greeting = `Hello ${user?.fullName || ''}! Welcome to FactoryPulse IntelliOps. I am your operational assistant. How can I help you today?`;
      setMessages([
        {
          id: 'welcome-1',
          sender: 'assistant',
          text: greeting,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const speakText = (text: string) => {
    if (!audioEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === 'hi' ? 'hi-IN' : language === 'mr' ? 'mr-IN' : 'en-US';
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputText).trim();
    if (!query) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    try {
      const res = await apiFetch<{ reply: string; actionLink?: string; actionLabel?: string }>('/api/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: query,
          language,
        }),
      });

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: res.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actionLink: res.actionLink,
        actionLabel: res.actionLabel,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      speakText(res.reply);
    } catch (err: any) {
      const fallbackMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: 'I am currently having trouble retrieving live database records: ' + err.message,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setLoading(false);
    }
  };

  const toggleMic = () => {
    if (!speechSupported || !recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-[#581C87] text-white rounded-full shadow-xl hover:bg-[#6b21a8] transition-all transform hover:scale-105 border border-[#14B8A6]/40"
        aria-label="Open FactoryPulse Assistant"
      >
        <Sparkles className="w-5 h-5 text-[#14B8A6] animate-pulse" />
        <span className="text-xs font-bold tracking-wide">{t('assistant_title')}</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 sm:w-96 bg-[#171B22] border border-neutral-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-white transition-all">
      {/* Assistant Header */}
      <div className="bg-gradient-to-r from-[#581C87] to-[#1F2937] px-4 py-3.5 flex items-center justify-between border-b border-neutral-700/60">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-[#14B8A6]/20 border border-[#14B8A6]/40 rounded-lg">
            <Bot className="w-5 h-5 text-[#14B8A6]" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-white">{t('assistant_title')}</h3>
            <p className="text-[10px] text-neutral-300 font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#14B8A6] animate-ping" />
              Connected · Scoped to {user?.role || 'Guest'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            className="p-1.5 text-neutral-300 hover:text-white rounded"
            title={audioEnabled ? 'Mute Voice Output' : 'Unmute Voice Output'}
          >
            {audioEnabled ? <Volume2 className="w-4 h-4 text-[#14B8A6]" /> : <VolumeX className="w-4 h-4 text-neutral-400" />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 text-neutral-300 hover:text-white rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3.5 max-h-80 min-h-[260px] bg-[#171B22]/95 text-xs">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-2.5 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] ${
                msg.sender === 'user' ? 'bg-[#FF6B35] text-white' : 'bg-[#581C87] text-[#14B8A6]'
              }`}
            >
              {msg.sender === 'user' ? <UserIcon className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
            </div>
            <div
              className={`max-w-[80%] rounded-xl p-3 text-xs leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-[#FF6B35] text-white rounded-tr-none'
                  : 'bg-[#252C36] border border-neutral-700/60 text-neutral-100 rounded-tl-none'
              }`}
            >
              <p>{msg.text}</p>
              {msg.actionLink && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    navigate(msg.actionLink!);
                  }}
                  className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#14B8A6] text-[#171B22] font-bold text-[11px] rounded hover:bg-[#14b8a6]/90 transition-colors"
                >
                  <span>{msg.actionLabel || 'Inspect Page'}</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
              <span className="block text-[9px] text-neutral-400 mt-1 text-right">{msg.timestamp}</span>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-neutral-400 font-mono italic">
            <Bot className="w-3.5 h-3.5 text-[#14B8A6] animate-spin" />
            Analyzing plant database records...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Voice Activity Indicator */}
      {(isListening || isSpeaking) && (
        <div className="px-4 py-1.5 bg-[#581C87]/40 border-t border-b border-neutral-700 flex items-center justify-between text-[11px] text-[#14B8A6] font-mono">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#14B8A6] animate-ping" />
            {isListening ? t('mic_listening') : t('mic_speaking')}
          </span>
          <span className="text-[10px] text-neutral-400">Web Speech API</span>
        </div>
      )}

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="p-3 bg-[#252C36] border-t border-neutral-700 flex items-center gap-2"
      >
        {speechSupported && (
          <button
            type="button"
            onClick={toggleMic}
            className={`p-2 rounded-lg transition-colors ${
              isListening ? 'bg-[#F05252] text-white animate-pulse' : 'bg-[#171B22] text-[#14B8A6] hover:bg-neutral-800'
            }`}
            title={isListening ? t('mic_stop') : t('mic_start')}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        )}

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={t('assistant_placeholder')}
          className="flex-1 px-3 py-2 bg-[#171B22] border border-neutral-700 rounded-lg text-xs text-white focus:outline-none focus:border-[#14B8A6]"
        />

        <button
          type="submit"
          disabled={!inputText.trim() || loading}
          className="p-2 bg-[#581C87] text-[#14B8A6] rounded-lg hover:bg-[#6b21a8] disabled:opacity-40 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
