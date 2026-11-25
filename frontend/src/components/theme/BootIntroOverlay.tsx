import { useCallback, useEffect, useRef, useState } from 'react';
import { useCustomTheme } from '../../contexts/CustomThemeContext';
import './BootIntroOverlay.css';

const VOICE_URLS: Record<number, string> = {
  1: '/theme-assets/voice/tawa_voice1.mp3',
  2: '/theme-assets/voice/tawa_voice2.mp3',
  3: '/theme-assets/voice/tawa_voice3.mp3',
  4: '/theme-assets/voice/tawa_voice4.mp3',
};

const STAGE_META: Array<[string, string, number]> = [
  ['[ 00 / 06 ] INITIALIZING', 'LOADING KERNEL...', 10],
  ['[ 01 / 06 ] AUTHORIZATION', 'AWAITING OPERATOR CONSENT', 24],
  ['[ 02 / 06 ] IDENTITY CHECK', 'UID 0042 / LEVEL ∞ READY', 42],
  ['[ 03 / 06 ] ACCESS VECTOR', 'SYNCHRONIZING NEURAL CORE', 58],
  ['[ 04 / 06 ] PERMISSION STREAM', 'STREAMING CLEARANCE KEYS', 74],
  ['[ 05 / 06 ] VERIFY', 'PERMISSION AUTHORIZED', 90],
  ['[ 06 / 06 ] WELCOME', 'SENSEI SESSION ACTIVE', 100],
];

function StaggerText({
  text,
  stepMs = 24,
  baseDelayMs = 0,
  className = '',
  style,
}: {
  text: string;
  stepMs?: number;
  baseDelayMs?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={className} style={style}>
      {Array.from(text).map((ch, idx) =>
        ch === ' ' ? (
          <span key={idx} className="agy-stagger-space" />
        ) : (
          <span
            key={idx}
            className="agy-stagger-char"
            style={{ animationDelay: `${baseDelayMs + idx * stepMs}ms` }}
          >
            {ch}
          </span>
        )
      )}
    </span>
  );
}

export function BootIntroOverlay() {
  const { config, bootReplayTick, triggerSketchReveal } = useCustomTheme();
  const [visible, setVisible] = useState<boolean>(() => {
    if (!config.enabled || !config.bootIntro) return false;
    try {
      return sessionStorage.getItem('agy_pulse_boot_played') !== '1';
    } catch {
      return true;
    }
  });

  const [hudMode, setHudMode] = useState(false);
  const [stage, setStage] = useState(0);
  const [done, setDone] = useState(false);
  const [instantDone, setInstantDone] = useState(false);
  const [sheenRun, setSheenRun] = useState(false);
  const [scanSweep, setScanSweep] = useState(false);
  const [flashBurst, setFlashBurst] = useState(false);
  const [wipeStage1, setWipeStage1] = useState(false);
  const [wipeStage2, setWipeStage2] = useState(false);
  const [fadeStage5, setFadeStage5] = useState(false);
  const [grantTriggered, setGrantTriggered] = useState(false);
  const [confirmTriggered, setConfirmTriggered] = useState(false);
  const [traceOutline, setTraceOutline] = useState(false);
  const [colorFilled, setColorFilled] = useState(false);
  const [fadeStroke, setFadeStroke] = useState(false);
  const [hexVisible, setHexVisible] = useState(false);
  const [hexLines, setHexLines] = useState<string[]>([]);
  const [clockText, setClockText] = useState('WEB PROFILE 00:00:00');
  const [morphKey, setMorphKey] = useState(0);

  const timersRef = useRef<number[]>([]);
  const hexTimerRef = useRef<number | null>(null);
  const clockTimerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const outlinePathRef = useRef<SVGPathElement | null>(null);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    if (hexTimerRef.current) {
      window.clearInterval(hexTimerRef.current);
      hexTimerRef.current = null;
    }
    if (clockTimerRef.current) {
      window.clearInterval(clockTimerRef.current);
      clockTimerRef.current = null;
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  const playClickSfx = useCallback((freq = 640, dur = 0.06, vol = 0.045) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      actxRef.current = actxRef.current || new AudioCtx();
      const ctx = actxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.45, ctx.currentTime + dur);
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      // ignore audio errors
    }
  }, []);

  const playTawaVoice = useCallback((slot: number) => {
    stopAudio();
    const src = VOICE_URLS[slot];
    if (!src) return;
    try {
      const audio = new Audio(src);
      audio.volume = 0.9;
      audioRef.current = audio;
      audio.play().catch(() => {});
    } catch {
      // ignore
    }
  }, [stopAudio]);

  const triggerScan = useCallback(() => {
    setScanSweep(false);
    requestAnimationFrame(() => setScanSweep(true));
  }, []);

  const startHex = useCallback((active: boolean) => {
    if (hexTimerRef.current) {
      window.clearInterval(hexTimerRef.current);
      hexTimerRef.current = null;
    }
    setHexVisible(active);
    if (!active) return;
    const gen = () => {
      const arr: string[] = [];
      for (let i = 0; i < 6; i++) {
        const val = Math.floor(Math.random() * 0xffff)
          .toString(16)
          .toUpperCase()
          .padStart(4, '0');
        arr.push(`0x${val} :: READ`);
      }
      setHexLines(arr);
    };
    gen();
    hexTimerRef.current = window.setInterval(gen, 110);
  }, []);

  const finishBoot = useCallback(
    (instant = false) => {
      clearAllTimers();
      startHex(false);
      try {
        sessionStorage.setItem('agy_pulse_boot_played', '1');
      } catch {
        // ignore
      }
      if (instant) {
        stopAudio();
        setDone(true);
        setInstantDone(true);
        setVisible(false);
        triggerSketchReveal();
        return;
      }
      setFlashBurst(false);
      requestAnimationFrame(() => setFlashBurst(true));
      timersRef.current.push(
        window.setTimeout(() => {
          setDone(true);
          triggerSketchReveal();
          timersRef.current.push(
            window.setTimeout(() => {
              setVisible(false);
              setFlashBurst(false);
            }, 720)
          );
        }, 340)
      );
    },
    [clearAllTimers, startHex, stopAudio, triggerSketchReveal]
  );

  const startSequence = useCallback(() => {
    clearAllTimers();
    stopAudio();
    setVisible(true);
    setHudMode(false);
    setStage(0);
    setDone(false);
    setInstantDone(false);
    setSheenRun(false);
    setScanSweep(false);
    setFlashBurst(false);
    setWipeStage1(false);
    setWipeStage2(false);
    setFadeStage5(false);
    setGrantTriggered(false);
    setConfirmTriggered(false);
    setTraceOutline(false);
    setColorFilled(false);
    setFadeStroke(false);
    setHexVisible(false);
    setMorphKey((k) => k + 1);

    const startMs = performance.now();
    clockTimerRef.current = window.setInterval(() => {
      const sec = Math.floor((performance.now() - startMs) / 1000);
      const mm = String(Math.floor(sec / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      setClockText(`WEB PROFILE 00:${mm}:${ss}`);
    }, 250);

    timersRef.current.push(
      window.setTimeout(() => {
        setSheenRun(true);
      }, 1050)
    );

    timersRef.current.push(
      window.setTimeout(() => {
        setHudMode(true);
        setStage(1);
        triggerScan();
      }, 2500)
    );
  }, [clearAllTimers, stopAudio, triggerScan]);

  // Run on initial mount if visible
  useEffect(() => {
    if (visible) {
      startSequence();
    }
    return () => {
      clearAllTimers();
      stopAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Run on manual replay trigger
  useEffect(() => {
    if (bootReplayTick > 0) {
      startSequence();
    }
  }, [bootReplayTick, startSequence]);

  const handleGrant = useCallback(() => {
    if (stageRef.current !== 1) return;
    setGrantTriggered(true);
    playClickSfx(680, 0.06, 0.05);
    playTawaVoice(1);
    timersRef.current.push(window.setTimeout(() => setWipeStage1(true), 240));
    timersRef.current.push(window.setTimeout(() => setStage(2), 560));
  }, [playClickSfx, playTawaVoice]);

  const runAutoAfterConfirm = useCallback(() => {
    setStage(3);
    setTraceOutline(false);
    setColorFilled(false);
    setFadeStroke(false);
    playClickSfx(520, 0.06, 0.045);

    requestAnimationFrame(() => {
      if (outlinePathRef.current) {
        const len = Math.ceil(outlinePathRef.current.getTotalLength() || 673);
        outlinePathRef.current.style.strokeDasharray = `${len}`;
        outlinePathRef.current.style.strokeDashoffset = `${len}`;
      }
      requestAnimationFrame(() => setTraceOutline(true));
    });

    timersRef.current.push(
      window.setTimeout(() => {
        setStage(4);
        startHex(true);
        setColorFilled(true);
        playClickSfx(620, 0.05, 0.04);

        timersRef.current.push(window.setTimeout(() => setFadeStroke(true), 520));

        timersRef.current.push(
          window.setTimeout(() => {
            startHex(false);
            setStage(5);
            triggerScan();
            playClickSfx(780, 0.08, 0.05);
            playTawaVoice(3);
          }, 1250)
        );

        timersRef.current.push(window.setTimeout(() => setFadeStage5(true), 2950));

        timersRef.current.push(
          window.setTimeout(() => {
            setStage(6);
            playClickSfx(880, 0.1, 0.045);
            playTawaVoice(4);
          }, 3620)
        );

        timersRef.current.push(window.setTimeout(() => finishBoot(false), 5750));
      }, 1080)
    );
  }, [finishBoot, playClickSfx, playTawaVoice, startHex, triggerScan]);

  const handleConfirm = useCallback(() => {
    if (stageRef.current !== 2) return;
    setConfirmTriggered(true);
    playClickSfx(820, 0.06, 0.05);
    playTawaVoice(2);
    timersRef.current.push(window.setTimeout(() => setWipeStage2(true), 240));
    timersRef.current.push(window.setTimeout(() => runAutoAfterConfirm(), 560));
  }, [playClickSfx, playTawaVoice, runAutoAfterConfirm]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!visible || done) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (stageRef.current === 1) {
          e.preventDefault();
          handleGrant();
        } else if (stageRef.current === 2) {
          e.preventDefault();
          handleConfirm();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finishBoot(true);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [visible, done, handleGrant, handleConfirm, finishBoot]);

  if (!visible && !flashBurst) return null;

  const [stepLabel, statusBottom, progressPct] = STAGE_META[stage] || STAGE_META[0];

  return (
    <>
      <div id="agy-flash-curtain" className={flashBurst ? 'burst' : ''} />

      {visible && (
        <section
          id="agy-boot-overlay"
          aria-label="Boot Sequence"
          className={`${hudMode ? 'hud-mode' : ''} ${done ? 'done' : ''} ${instantDone ? 'instant' : ''}`}
        >
          <div className="agy-boot-starfield" />
          <div className="agy-boot-vignette" />
          <div className={`agy-splash-sheen ${sheenRun ? 'run' : ''}`} />
          <div className={`agy-hud-scanline ${scanSweep ? 'sweep' : ''}`} />

          <header className="agy-boot-header">
            <div className="agy-boot-brand">
              <strong>ANTIGRAVITY</strong>
              <span className="sub-line">SYNTHESIZE INTELLIGENCE</span>
              <div className="agy-boot-rev">
                <span>REV 0.1.9</span>
                <span>•</span>
                <span className="blue-rev">{clockText}</span>
              </div>
            </div>
            <button
              className="agy-boot-skip"
              type="button"
              onClick={() => finishBoot(true)}
            >
              SKIP ▸
            </button>
          </header>

          <div className="agy-boot-stage-wrap">
            {/* Stage 0: Splash */}
            <div className={`agy-boot-stage ${stage === 0 ? 'active' : ''}`} key={`s0-${morphKey}`}>
              <img
                className="agy-splash-logo"
                src="/theme-assets/agy-icon-color.png"
                alt="Antigravity"
              />
              <div className="agy-splash-wordmark">ANTIGRAVITY</div>
              <div className="agy-splash-caption">SYNTHESIZE INTELLIGENCE</div>
            </div>

            {/* Stage 1: Grant Access */}
            <div className={`agy-boot-stage ${stage === 1 ? 'active' : ''} ${wipeStage1 ? 'wipe-out' : ''}`}>
              {stage === 1 && (
                <>
                  <div style={{ marginBottom: 6 }}>
                    <StaggerText text="YÊU CẦU QUYỀN TRUY CẬP" stepMs={26} className="agy-hud-title" />
                  </div>
                  <div className="agy-hud-subtitle">
                    <StaggerText text="ACCESS PERMISSION REQUIRED" stepMs={14} baseDelayMs={90} />
                  </div>
                  <button
                    className={`agy-hud-btn ${grantTriggered ? 'triggered' : ''}`}
                    type="button"
                    onClick={handleGrant}
                  >
                    <span>CẤP QUYỀN &nbsp; GRANT ACCESS</span>
                  </button>
                  <div className="agy-hud-hint">Nhấn Enter / Space hoặc bấm nút để tiếp tục</div>
                </>
              )}
            </div>

            {/* Stage 2: Identity Verification */}
            <div className={`agy-boot-stage ${stage === 2 ? 'active' : ''} ${wipeStage2 ? 'wipe-out' : ''}`}>
              {stage === 2 && (
                <>
                  <div style={{ marginBottom: 6 }}>
                    <StaggerText text="XÁC MINH DANH TÍNH" stepMs={26} className="agy-hud-title" />
                  </div>
                  <div className="agy-hud-subtitle">
                    <StaggerText text="IDENTITY VERIFICATION" stepMs={14} baseDelayMs={90} />
                  </div>
                  <div className="agy-id-table">
                    <div className="agy-id-row">
                      <span>TÊN TRUY CẬP / OPERATOR</span>
                      <span>SENSEI</span>
                    </div>
                    <div className="agy-id-row">
                      <span>MÃ ĐỊNH DANH / UID</span>
                      <span>0042</span>
                    </div>
                    <div className="agy-id-row">
                      <span>CẤP QUYỀN / LEVEL</span>
                      <span>∞</span>
                    </div>
                  </div>
                  <button
                    className={`agy-hud-btn ${confirmTriggered ? 'triggered' : ''}`}
                    type="button"
                    onClick={handleConfirm}
                  >
                    <span>XÁC NHẬN &nbsp; CONFIRM IDENTITY</span>
                  </button>
                  <div className="agy-hud-hint">Nhấn Enter / Space hoặc bấm nút để xác nhận</div>
                </>
              )}
            </div>

            {/* Stage 3 & 4: Icon Stroke Morph + Color Fill */}
            <div className={`agy-boot-stage ${stage === 3 || stage === 4 ? 'active' : ''}`}>
              {(stage === 3 || stage === 4) && (
                <>
                  <div style={{ marginBottom: 6 }}>
                    <StaggerText
                      key={stage === 3 ? 't3' : 't4'}
                      text={stage === 3 ? 'ĐANG TIẾP NHẬN YÊU CẦU' : 'BẮT ĐẦU ĐỌC QUYỀN HẠN'}
                      stepMs={16}
                      className="agy-hud-title"
                    />
                  </div>
                  <div className="agy-hud-subtitle" style={{ marginBottom: 10 }}>
                    <StaggerText
                      key={stage === 3 ? 'sub3' : 'sub4'}
                      text={stage === 3 ? 'ACCESS REQUEST RECEIVED' : 'PERMISSION READ STARTED'}
                      stepMs={10}
                      baseDelayMs={90}
                    />
                  </div>
                  <div className="agy-icon-morph-box">
                    <svg
                      className={`agy-icon-outline-svg ${fadeStroke ? 'fade-stroke' : ''}`}
                      viewBox="0 0 256 256"
                    >
                      <defs>
                        <linearGradient id="agyBootStrokeGrad" x1="10%" y1="90%" x2="88%" y2="12%">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="38%" stopColor="#22c55e" />
                          <stop offset="68%" stopColor="#f59e0b" />
                          <stop offset="86%" stopColor="#ef4444" />
                          <stop offset="100%" stopColor="#3b82f6" />
                        </linearGradient>
                      </defs>
                      <path
                        ref={outlinePathRef}
                        className={`agy-icon-outline-path ${traceOutline ? 'trace' : ''}`}
                        d="M 116.50,42.00 Q 111.00,44.00 105.00,49.50 Q 99.00,55.00 94.00,64.00 Q 89.00,73.00 74.50,119.50 Q 60.00,166.00 53.50,178.00 Q 47.00,190.00 40.00,198.00 Q 33.00,206.00 32.50,209.00 Q 32.00,212.00 34.00,213.50 Q 36.00,215.00 39.00,215.00 Q 42.00,215.00 49.00,211.00 Q 56.00,207.00 64.50,198.00 Q 73.00,189.00 82.50,173.00 Q 92.00,157.00 98.00,149.50 Q 104.00,142.00 110.00,138.50 Q 116.00,135.00 125.50,134.50 Q 135.00,134.00 141.50,137.00 Q 148.00,140.00 152.50,144.50 Q 157.00,149.00 169.00,168.50 Q 181.00,188.00 187.50,195.50 Q 194.00,203.00 200.50,208.00 Q 207.00,213.00 210.00,214.00 Q 213.00,215.00 216.50,214.50 Q 220.00,214.00 221.00,213.00 Q 222.00,212.00 221.50,208.50 Q 221.00,205.00 212.00,194.00 Q 203.00,183.00 197.00,170.00 Q 191.00,157.00 182.50,127.00 Q 174.00,97.00 166.50,78.50 Q 159.00,60.00 153.50,53.50 Q 148.00,47.00 144.00,44.50 Q 140.00,42.00 131.00,41.00 Q 122.00,40.00 116.50,42.00 Z"
                      />
                    </svg>
                    <img
                      className={`agy-icon-color-fill ${colorFilled ? 'filled' : ''}`}
                      src="/theme-assets/agy-icon-color.png"
                      alt="Antigravity"
                    />
                  </div>
                  <div className="agy-dot-grid-small">
                    ANTIGRAVITY
                    <br />· · · · · · · · · ·
                  </div>
                </>
              )}
            </div>

            {/* Stage 5: Rotating Verify Ring */}
            <div className={`agy-boot-stage ${stage === 5 ? 'active' : ''} ${fadeStage5 ? 'stage-fade-out' : ''}`}>
              {stage === 5 && (
                <div className="agy-verify-ring-stage">
                  <svg className="agy-arc-svg" viewBox="0 0 320 320">
                    <circle
                      cx="160"
                      cy="160"
                      r="146"
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="3.2"
                      strokeDasharray="430 140 160 220"
                      strokeLinecap="round"
                    />
                    <circle cx="160" cy="14" r="4.5" fill="#ffffff" />
                  </svg>
                  <svg className="agy-arc-svg-inner" viewBox="0 0 264 264">
                    <circle
                      cx="132"
                      cy="132"
                      r="122"
                      fill="none"
                      stroke="rgba(255,255,255,0.22)"
                      strokeWidth="1"
                      strokeDasharray="6 10"
                    />
                  </svg>
                  <div className="agy-orbit-dots">
                    <div className="agy-orbit-dot" style={{ top: '12%', left: '32%' }} />
                    <div className="agy-orbit-dot w" style={{ top: '28%', right: '14%' }} />
                    <div className="agy-orbit-dot" style={{ bottom: '18%', left: '22%' }} />
                    <div className="agy-orbit-dot w" style={{ bottom: '24%', right: '28%' }} />
                  </div>
                  <div>
                    <div style={{ marginBottom: 6 }}>
                      <StaggerText
                        text="HOÀN TẤT · ĐÃ XÁC THỰC"
                        stepMs={24}
                        className="agy-hud-title"
                        style={{ fontSize: 17, letterSpacing: '0.1em' }}
                      />
                    </div>
                    <div className="agy-hud-subtitle" style={{ marginBottom: 0, fontSize: 9, letterSpacing: '0.24em' }}>
                      <StaggerText text="READ COMPLETE · VERIFIED" stepMs={14} baseDelayMs={90} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Stage 6: Welcome Sensei */}
            <div className={`agy-boot-stage ${stage === 6 ? 'active' : ''}`}>
              {stage === 6 && (
                <>
                  <div className="agy-welcome-eyebrow">
                    <StaggerText text="WELCOME TO" stepMs={28} />
                  </div>
                  <div className="agy-welcome-solid-box agy-welcome-reveal" style={{ animationDelay: '240ms' }}>
                    ANTIGRAVITY
                  </div>
                  <div className="agy-welcome-flare-wrap agy-welcome-reveal" style={{ animationDelay: '360ms' }}>
                    <img src="/theme-assets/agy-icon-color.png" alt="Antigravity" />
                  </div>
                  <div
                    className="agy-dot-grid-small agy-welcome-reveal"
                    style={{ marginBottom: 8, animationDelay: '460ms' }}
                  >
                    A N T I G R A V I T Y
                  </div>
                  <div
                    className="agy-hud-hint agy-welcome-reveal"
                    style={{ color: '#a1a1aa', letterSpacing: '0.2em', animationDelay: '540ms' }}
                  >
                    CHÀO MỪNG SENSEI • SESSION READY
                  </div>
                </>
              )}
            </div>
          </div>

          <div className={`agy-hex-column ${hexVisible ? 'visible' : ''}`}>
            {hexLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>

          <footer className="agy-boot-footer">
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div className="agy-eq-bars">
                <span />
                <span />
                <span />
              </div>
              <span>{stepLabel}</span>
            </div>
            <span>{statusBottom}</span>
            <span>ID CONFIRMED : 0042</span>
            <div className="agy-bottom-progress-track">
              <div className="agy-bottom-progress-bar" style={{ width: `${progressPct}%` }} />
            </div>
          </footer>
        </section>
      )}
    </>
  );
}
