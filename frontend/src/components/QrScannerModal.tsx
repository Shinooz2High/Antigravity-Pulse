import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, ImagePlus, QrCode, RefreshCw, X } from 'lucide-react';
import { triggerHaptic } from '../lib/native';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
}

export function QrScannerModal({
  isOpen,
  onClose,
  onScanSuccess,
}: QrScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const resolvedRef = useRef(false);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleDecoded = useCallback(
    (text: string) => {
      if (resolvedRef.current || !text.trim()) return;
      resolvedRef.current = true;
      triggerHaptic('success');
      stopCamera();
      onScanSuccess(text.trim());
    },
    [onScanSuccess, stopCamera]
  );

  const startCamera = useCallback(async () => {
    stopCamera();
    resolvedRef.current = false;
    setCameraError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'Thiết bị hoặc trình duyệt không cấp quyền Camera trực tiếp. Bạn có thể chọn ảnh chụp mã QR bên dưới.'
      );
      return;
    }

    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        stopCamera();
        return;
      }
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();

      const scanFrame = () => {
        if (resolvedRef.current || !videoRef.current || !canvasRef.current) return;
        const v = videoRef.current;
        if (v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth > 0 && v.videoHeight > 0) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            const targetW = Math.min(640, v.videoWidth);
            const scale = targetW / v.videoWidth;
            const targetH = Math.floor(v.videoHeight * scale);
            canvas.width = targetW;
            canvas.height = targetH;
            ctx.drawImage(v, 0, 0, targetW, targetH);
            const imageData = ctx.getImageData(0, 0, targetW, targetH);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'attemptBoth',
            });
            if (code?.data) {
              handleDecoded(code.data);
              return;
            }
          }
        }
        rafRef.current = window.requestAnimationFrame(scanFrame);
      };

      rafRef.current = window.requestAnimationFrame(scanFrame);
    } catch {
      setCameraError(
        'Không thể mở Camera (hãy cho phép quyền Camera hoặc chọn ảnh chụp mã QR từ thư viện).'
      );
    } finally {
      setStarting(false);
    }
  }, [handleDecoded, stopCamera]);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    startCamera();
    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setCameraError(null);
    try {
      const bitmapUrl = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Không thể đọc ảnh'));
        img.src = bitmapUrl;
      });
      URL.revokeObjectURL(bitmapUrl);

      const canvas = document.createElement('canvas');
      const maxDim = 1400;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.floor(img.width * scale));
      canvas.height = Math.max(1, Math.floor(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Không khởi tạo được bộ giải mã ảnh');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imgData.data, imgData.width, imgData.height, {
        inversionAttempts: 'attemptBoth',
      });

      if (code?.data) {
        handleDecoded(code.data);
      } else {
        setCameraError('Không tìm thấy mã QR hợp lệ trong bức ảnh này. Hãy chụp rõ nét hơn.');
      }
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Lỗi đọc mã QR từ ảnh.');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-700/80 bg-[#0d1322] text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Quét mã QR ghép nối PC</h3>
              <p className="text-[11px] text-slate-400">
                Hướng camera vào mã QR trên cửa sổ PowerShell hoặc Cài đặt PC
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-slate-700 bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              className="h-full w-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Viewfinder Frame */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-56 w-56 rounded-2xl border-2 border-cyan-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
            </div>

            {starting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 text-xs text-slate-300">
                <RefreshCw className="h-7 w-7 animate-spin text-cyan-400" />
                <span className="mt-2">Đang khởi động Camera...</span>
              </div>
            )}
          </div>

          {cameraError && (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
              {cameraError}
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={startCamera}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-700"
            >
              <Camera className="h-4 w-4 text-cyan-400" />
              Mở lại Camera
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 px-3 text-xs font-semibold text-white shadow-md shadow-cyan-500/20 hover:brightness-110"
            >
              <ImagePlus className="h-4 w-4" />
              Chọn ảnh mã QR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
