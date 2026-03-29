'use client';

import { useEffect, useRef } from 'react';

export default function ErrorReporter() {
  const lockedRef = useRef(false);

  useEffect(() => {
    const showAlert = () => {
      if (lockedRef.current) return;
      lockedRef.current = true;

      alert(
        'Если что-то сломалось, сделайте скриншот и отправьте его на +79917735343 в MAX или TG.'
      );

      setTimeout(() => {
        lockedRef.current = false;
      }, 15000);
    };

    const onError = () => showAlert();
    const onRejection = () => showAlert();

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}