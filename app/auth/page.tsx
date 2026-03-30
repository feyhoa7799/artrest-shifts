// app/auth/page.tsx
"use client";
import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function AuthPage() {
  const supabase = createClientComponentClient();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "verify">("email");

  const sendOTP = async () => {
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (!error) setStep("verify");
    else alert(error.message);
  };

  const verifyOTP = async () => {
    const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" });
    if (!error) window.location.href = "/profile";
    else alert(error.message);
  };

  return (
    <div>
      {step === "email" && (
        <>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <button onClick={sendOTP}>Отправить код</button>
        </>
      )}
      {step === "verify" && (
        <>
          <input
            placeholder="Код из письма"
            value={otp}
            onChange={e => setOtp(e.target.value)}
          />
          <button onClick={verifyOTP}>Подтвердить</button>
        </>
      )}
    </div>
  );
}