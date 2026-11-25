// PromptComposer Component · AI Agent Prompt & Command Composer
import React, { useEffect, useRef, useState } from 'react';
import './PromptComposer.css';

export interface ModelOption {
  id: string;
  name: string;
  tag?: string;
}

export interface ActionOption {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export interface PromptComposerPayload {
  text: string;
  action: string;
  model: string;
  attachments?: File[];
}

export interface PromptComposerProps {
  theme?: 'light' | 'dark';
  onSend: (payload: PromptComposerPayload) => void;
  placeholder?: string;
  models?: ModelOption[];
  defaultModel?: string;
  actions?: ActionOption[];
  defaultAction?: string;
  suggestionChips?: string[];
  allowAttachments?: boolean;
  className?: string;
  disabled?: boolean;
}

const DEFAULT_MODELS: ModelOption[] = [
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', tag: 'Fast' },
  { id: 'gemini-3-pro', name: 'Gemini 3 Pro', tag: 'Reasoning' },
  { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', tag: 'Thinking' },
  { id: 'gpt-4o', name: 'GPT-4o', tag: 'Vision' },
];

const DEFAULT_ACTIONS: ActionOption[] = [
  { id: 'run_agent', label: 'Agent Run' },
  { id: 'chat_only', label: 'Chat Only' },
  { id: 'code_review', label: 'Code Review' },
  { id: 'deep_research', label: 'Deep Research' },
];

const DEFAULT_CHIPS = [
  'Tóm tắt dự án',
  'Kiểm tra git status & lỗi',
  'Đọc mã nguồn & tối ưu',
  'Viết test suite',
];

export function PromptComposer({
  theme = 'light',
  onSend,
  placeholder = 'Nhập câu hỏi, mô tả tác vụ hoặc lệnh cho Agent... (Enter để gửi)',
  models = DEFAULT_MODELS,
  defaultModel,
  actions = DEFAULT_ACTIONS,
  defaultAction,
  suggestionChips = DEFAULT_CHIPS,
  allowAttachments = true,
  className = '',
  disabled = false,
}: PromptComposerProps) {
  const [text, setText] = useState('');
  const [selectedModel, setSelectedModel] = useState(defaultModel || models[0]?.id || '');
  const [selectedAction, setSelectedAction] = useState(defaultAction || actions[0]?.id || '');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isFocused, setIsFocused] = useState(false);

  // Dropdown states
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  // Click outside to close menus
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsModelMenuOpen(false);
        setIsActionMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, []);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    if (disabled) return;

    onSend({
      text: trimmed,
      action: selectedAction,
      model: selectedModel,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    setText('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChipClick = (chipText: string) => {
    setText((prev) => (prev ? `${prev} ${chipText}` : chipText));
    textareaRef.current?.focus();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setAttachments((prev) => [...prev, ...newFiles]);
      e.target.value = '';
    }
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const activeModelObj = models.find((m) => m.id === selectedModel) || models[0];
  const activeActionObj = actions.find((a) => a.id === selectedAction) || actions[0];

  return (
    <div
      ref={rootRef}
      className={`pc-root pc-theme-${theme} ${className}`.trim()}
    >
      {/* Quick Suggestion Chips */}
      {suggestionChips && suggestionChips.length > 0 && (
        <div className="pc-chips">
          {suggestionChips.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              className="pc-chip"
              onClick={() => handleChipClick(chip)}
            >
              <span>✨</span>
              <span>{chip}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main Composer Box */}
      <div className={`pc-box ${isFocused ? 'is-focused' : ''}`}>
        {/* Attached Files List */}
        {attachments.length > 0 && (
          <div className="pc-attachments">
            {attachments.map((file, i) => (
              <span key={i} className="pc-attachment-tag">
                <span className="truncate max-w-[140px]">{file.name}</span>
                <button
                  type="button"
                  className="pc-attachment-remove"
                  onClick={() => removeAttachment(i)}
                  aria-label="Remove attachment"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Textarea Input */}
        <textarea
          ref={textareaRef}
          className="pc-textarea"
          rows={1}
          placeholder={placeholder}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
        />

        {/* Bottom Toolbar */}
        <div className="pc-toolbar">
          <div className="pc-toolbar-left">
            {/* Attachment Button */}
            {allowAttachments && (
              <>
                <button
                  type="button"
                  className="pc-tool-btn pc-icon-btn"
                  title="Đính kèm tệp tin"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
              </>
            )}

            {/* Model Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                className={`pc-tool-btn ${isModelMenuOpen ? 'is-active' : ''}`}
                onClick={() => {
                  setIsModelMenuOpen(!isModelMenuOpen);
                  setIsActionMenuOpen(false);
                }}
              >
                <span>🧠 {activeModelObj?.name || 'Model'}</span>
                <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 opacity-60">
                  <path d="M3 4.8 6 7.8l3-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {isModelMenuOpen && (
                <div className="pc-dropdown">
                  {models.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`pc-dropdown-item ${m.id === selectedModel ? 'is-selected' : ''}`}
                      onClick={() => {
                        setSelectedModel(m.id);
                        setIsModelMenuOpen(false);
                      }}
                    >
                      <span>{m.name}</span>
                      {m.tag && <span className="pc-dropdown-item-tag">{m.tag}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Action / Mode Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                className={`pc-tool-btn ${isActionMenuOpen ? 'is-active' : ''}`}
                onClick={() => {
                  setIsActionMenuOpen(!isActionMenuOpen);
                  setIsModelMenuOpen(false);
                }}
              >
                <span>⚡ {activeActionObj?.label || 'Action'}</span>
                <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 opacity-60">
                  <path d="M3 4.8 6 7.8l3-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {isActionMenuOpen && (
                <div className="pc-dropdown">
                  {actions.map((act) => (
                    <button
                      key={act.id}
                      type="button"
                      className={`pc-dropdown-item ${act.id === selectedAction ? 'is-selected' : ''}`}
                      onClick={() => {
                        setSelectedAction(act.id);
                        setIsActionMenuOpen(false);
                      }}
                    >
                      <span>{act.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Send Button */}
          <div className="pc-toolbar-right">
            <button
              type="button"
              className="pc-send-btn"
              disabled={disabled || (!text.trim() && attachments.length === 0)}
              onClick={handleSend}
              aria-label="Send prompt"
            >
              <span className="pc-send-text">Gửi</span>
              <svg viewBox="0 0 16 16" fill="none">
                <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PromptComposer;
