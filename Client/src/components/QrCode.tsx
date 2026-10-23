import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrCode({ value }: { value: string }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    if (!value) {
      setSrc('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 720,
      color: { dark: '#241820', light: '#ffffffff' },
    }).then((url: string) => {
      if (!cancelled) setSrc(url);
    }).catch(() => {
      if (!cancelled) setSrc('');
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!src) return null;
  return (
    <div className="qr-frame">
      <img src={src} alt="QR-код на карточку гостя" />
    </div>
  );
}
