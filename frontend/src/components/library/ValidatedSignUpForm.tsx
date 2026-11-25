// Lucian UX/UI Prompt #244 · Validated Sign-Up Form with Live Error Summary
import { useId, useRef, useState } from 'react';
import './ValidatedSignUpForm.css';

export interface SignUpFormValues {
  name: string;
  email: string;
  password: string;
  phone: string;
  agreed: boolean;
}

export interface ValidatedSignUpFormProps {
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  doneLabel?: string;
  onSuccess?: (values: SignUpFormValues) => void;
  className?: string;
}

interface FieldDef {
  key: 'name' | 'email' | 'password' | 'phone';
  label: string;
  shortLabel: string;
  type: 'text' | 'email' | 'password' | 'tel';
  placeholder: string;
  errorMessage: string;
  validate: (val: string) => boolean;
}

const FIELDS: FieldDef[] = [
  {
    key: 'name',
    label: 'Họ và tên',
    shortLabel: 'Họ và tên',
    type: 'text',
    placeholder: 'VD: Nguyễn Minh',
    errorMessage: 'Vui lòng nhập họ và tên của bạn',
    validate: (v) => v.trim().length > 0,
  },
  {
    key: 'email',
    label: 'Email',
    shortLabel: 'Email',
    type: 'email',
    placeholder: 'name@example.com',
    errorMessage: 'Email chưa đúng định dạng (VD: name@site.com)',
    validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v),
  },
  {
    key: 'password',
    label: 'Mật khẩu',
    shortLabel: 'Mật khẩu',
    type: 'password',
    placeholder: 'Tối thiểu 8 ký tự kèm ít nhất 1 chữ số',
    errorMessage: 'Dùng ít nhất 8 ký tự và có tối thiểu 1 chữ số',
    validate: (v) => v.length >= 8 && /\d/.test(v),
  },
  {
    key: 'phone',
    label: 'Số điện thoại (tùy chọn)',
    shortLabel: 'Số điện thoại',
    type: 'tel',
    placeholder: '09xx xxx xxx',
    errorMessage: '',
    validate: () => true,
  },
];

export function ValidatedSignUpForm({
  title = 'Tạo tài khoản',
  subtitle = 'Chỉ mất khoảng 1 phút để thiết lập',
  submitLabel = 'Đăng ký',
  doneLabel = 'Đăng ký thành công! Chào mừng Sensei',
  onSuccess,
  className = '',
}: ValidatedSignUpFormProps) {
  const uid = useId();
  const [values, setValues] = useState<SignUpFormValues>({
    name: '',
    email: '',
    password: '',
    phone: '',
    agreed: false,
  });
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState(false);
  const [summaryIndices, setSummaryIndices] = useState<number[]>([]);
  const [shakeTick, setShakeTick] = useState(0);
  const [shakingIndices, setShakingIndices] = useState<number[]>([]);

  const formRef = useRef<HTMLFormElement>(null);
  const fieldWrapRefs = useRef<Array<HTMLDivElement | null>>([]);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const agreeRef = useRef<HTMLButtonElement>(null);

  const computeBad = (v: SignUpFormValues): number[] => {
    const bad: number[] = [];
    FIELDS.forEach((f, i) => {
      if (!f.validate(v[f.key])) bad.push(i);
    });
    if (!v.agreed) bad.push(4);
    return bad;
  };

  const currentBad = tried ? computeBad(values) : [];

  const scrollToAndFocus = (index: number) => {
    const sc = formRef.current;
    const targetWrap = index < 4 ? fieldWrapRefs.current[index] : agreeRef.current;
    const targetInput = index < 4 ? inputRefs.current[index] : agreeRef.current;
    if (!sc || !targetWrap) {
      targetInput?.focus();
      return;
    }

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const targetY = Math.max(0, targetWrap.offsetTop - 70);
    const startY = sc.scrollTop;
    const duration = reducedMotion ? 0 : 480;
    const t0 = performance.now();

    const step = (now: number) => {
      const k = duration ? Math.min(1, (now - t0) / duration) : 1;
      const ease = 1 - Math.pow(1 - k, 3);
      sc.scrollTop = startY + (targetY - startY) * ease;
      if (k < 1) {
        requestAnimationFrame(step);
      } else {
        targetInput?.focus({ preventScroll: true });
      }
    };
    requestAnimationFrame(step);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (done) return;

    setTried(true);
    const bad = computeBad(values);
    if (bad.length === 0) {
      setDone(true);
      setSummaryIndices([]);
      onSuccess?.(values);
      return;
    }

    setSummaryIndices(bad);
    setShakingIndices(bad);
    setShakeTick((t) => t + 1);

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    window.setTimeout(() => {
      scrollToAndFocus(bad[0]);
    }, reducedMotion ? 0 : 180);
  };

  const isErr = tried && currentBad.length > 0;

  return (
    <div className={`u244-wrap ${isErr ? 'is-err' : ''} ${className}`.trim()}>
      <form
        ref={formRef}
        className="u244-sc"
        noValidate
        aria-label="Sign-up form"
        onSubmit={handleSubmit}
      >
        <div className="u244-hd">
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>

        {/* Live Collapsible Error Summary */}
        <div className="u244-sm" role="alert">
          <div>
            <div className="u244-sb">
              <b>
                <i>!</i>
                <span>
                  {currentBad.length} mục cần kiểm tra lại
                </span>
              </b>
              <ul>
                {summaryIndices.map((idx) => {
                  const fixed = !currentBad.includes(idx);
                  const label = idx < 4 ? FIELDS[idx].shortLabel : 'Điều khoản sử dụng';
                  return (
                    <li key={idx} className={fixed ? 'is-fixed' : undefined}>
                      <a
                        href={`#${uid}-${idx}`}
                        onClick={(ev) => {
                          ev.preventDefault();
                          scrollToAndFocus(idx);
                        }}
                      >
                        {label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>

        {/* Fields */}
        <div>
          {FIELDS.map((field, i) => {
            const val = values[field.key];
            const isBad = tried && currentBad.includes(i);
            const isGood = tried && !isBad && val.length > 0;
            const shouldShake = shakingIndices.includes(i);
            const inputId = `${uid}-${i}`;
            const msgId = `${uid}-m-${i}`;

            return (
              <div
                key={`${field.key}-${shouldShake ? shakeTick : 0}`}
                ref={(el) => {
                  fieldWrapRefs.current[i] = el;
                }}
                className={`u244-fd ${isBad ? 'is-bad' : ''} ${isGood ? 'is-good' : ''} ${shouldShake && isBad ? 'is-shake' : ''}`.trim()}
              >
                <label htmlFor={inputId}>{field.label}</label>
                <div className="u244-bx">
                  <input
                    ref={(el) => {
                      inputRefs.current[i] = el;
                    }}
                    id={inputId}
                    type={field.type}
                    value={val}
                    placeholder={field.placeholder}
                    autoComplete="off"
                    aria-invalid={isBad}
                    aria-describedby={msgId}
                    className="u244-in"
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                  />
                  <span className="u244-ok" aria-hidden="true" />
                </div>
                <div className="u244-ms">
                  <div>
                    <span id={msgId}>{field.errorMessage}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Terms Checkbox */}
        <button
          key={`ag-${shakingIndices.includes(4) ? shakeTick : 0}`}
          ref={agreeRef}
          type="button"
          role="checkbox"
          aria-checked={values.agreed}
          className={`u244-ag ${tried && currentBad.includes(4) ? 'is-bad' : ''} ${shakingIndices.includes(4) && currentBad.includes(4) ? 'is-shake' : ''}`.trim()}
          onClick={() => setValues((prev) => ({ ...prev, agreed: !prev.agreed }))}
        >
          <i aria-hidden="true" />
          <span>Tôi đồng ý với điều khoản sử dụng và chính sách bảo mật</span>
        </button>

        {/* Submit Button */}
        <button type="submit" className={`u244-go ${done ? 'is-done' : ''}`.trim()}>
          {done ? doneLabel : submitLabel}
        </button>
      </form>
    </div>
  );
}

export default ValidatedSignUpForm;
