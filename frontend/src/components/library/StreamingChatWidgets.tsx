// Lucian UX/UI Prompt #086 · AI Streaming Chat Micro-Interactions
import './StreamingChatWidgets.css';

export function StreamingAgentAvatar({ isGenerating = false }: { isGenerating?: boolean }) {
  return (
    <span
      className={`u086-av ${isGenerating ? 'is-gen' : ''}`.trim()}
      aria-hidden="true"
    />
  );
}

export function StreamingThinkingDots({ label = 'Agent đang suy nghĩ...' }: { label?: string }) {
  return (
    <div className="inline-flex items-center gap-3 py-2">
      <span className="u086-dots" aria-label={label}>
        <i />
        <i />
        <i />
      </span>
      <span className="text-xs font-medium text-slate-400">{label}</span>
    </div>
  );
}

export function StreamingCaret() {
  return <span className="u086-caret" aria-hidden="true" />;
}

export function StreamingControlButton({
  isGenerating,
  disabled = false,
  onStop,
  onRegenerate,
}: {
  isGenerating: boolean;
  disabled?: boolean;
  onStop: () => void;
  onRegenerate: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={isGenerating ? onStop : onRegenerate}
      className={`u086-ctl ${isGenerating ? 'is-stop' : ''}`.trim()}
    >
      {isGenerating ? (
        <>
          <i aria-hidden="true" />
          <span>Dừng</span>
        </>
      ) : (
        <>
          <svg viewBox="0 0 14 14" aria-hidden="true">
            <path d="M11.5 7a4.5 4.5 0 1 1-1.3-3.2M11.5 2v2.5H9" />
          </svg>
          <span>Tạo lại</span>
        </>
      )}
    </button>
  );
}
