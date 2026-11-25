// Lucian UX/UI Prompt #269 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#269
import React, { useEffect, useRef, useState } from 'react';
import './TypeToConfirmDeleteModal.css';

export interface TypeToConfirmDeleteModalProps {
  isOpen: boolean;
  targetName: string;
  title?: string;
  description?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function TypeToConfirmDeleteModal({
  isOpen,
  targetName,
  title = 'Xác nhận xóa dự án',
  description = 'Thao tác này sẽ gỡ bỏ dự án khỏi danh sách quản lý. Nhập chính xác tên dự án bên dưới để mở khóa nút xóa.',
  onConfirm,
  onCancel,
}: TypeToConfirmDeleteModalProps) {
  const [inputVal, setInputVal] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastLenRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      setInputVal('');
      lastLenRef.current = 0;
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  let matchedCount = 0;
  while (
    matchedCount < inputVal.length &&
    matchedCount < targetName.length &&
    inputVal[matchedCount] === targetName[matchedCount]
  ) {
    matchedCount++;
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    let k = 0;
    while (k < val.length && k < targetName.length && val[k] === targetName[k]) k++;

    if (val.length > lastLenRef.current && k < val.length) {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 350);
    }
    lastLenRef.current = val.length;
    setInputVal(val);
  };

  const isMatched = inputVal === targetName;

  const handleConfirm = () => {
    if (!isMatched) return;
    onConfirm();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className={`u269-dim ${isOpen ? 'is-open' : ''}`} onClick={onCancel} />
      <div
        className={`u269-md ${isOpen ? 'is-open' : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
      >
        <h4 id="delete-dialog-title">
          <i aria-hidden="true">!</i>
          {title}
        </h4>
        <p>{description}</p>

        <div className="u269-nm" aria-hidden="true">
          {targetName.split('').map((char, idx) => (
            <span
              key={idx}
              className={idx < matchedCount ? 'is-ok' : ''}
            >
              {char}
            </span>
          ))}
        </div>

        <input
          ref={inputRef}
          className={`u269-in ${isShaking ? 'is-shake' : ''}`}
          placeholder={targetName}
          value={inputVal}
          onChange={handleChange}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel();
            if (e.key === 'Enter' && isMatched) handleConfirm();
          }}
          autoComplete="off"
          spellCheck={false}
        />

        <div className="u269-bs">
          <button type="button" className="u269-cx" onClick={onCancel}>
            Hủy bỏ
          </button>
          <button
            type="button"
            className="u269-go"
            disabled={!isMatched}
            onClick={handleConfirm}
          >
            Xác nhận xóa
          </button>
        </div>
      </div>
    </>
  );
}

export default TypeToConfirmDeleteModal;
