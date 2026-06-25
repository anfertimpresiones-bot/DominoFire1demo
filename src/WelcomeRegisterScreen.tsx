import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase.js";

const DOMINICAN_APODOS = [
  "El Mudo", "La Loma", "El Capicúa", "La Doble Seis",
  "El Trancao", "El Colmadero", "La Reina", "El Socio",
  "El Tigre", "La Bulla", "El Cañero", "El Bachatero"
];

const COUNTRY_OPTIONS = [
  { code: "DO", flag: "🇩🇴", name: "República Dominicana" },
  { code: "US", flag: "🇺🇸", name: "Estados Unidos" },
  { code: "PR", flag: "🇵🇷", name: "Puerto Rico" },
  { code: "ES", flag: "🇪🇸", name: "España" },
  { code: "MX", flag: "🇲🇽", name: "México" },
  { code: "VE", flag: "🇻🇪", name: "Venezuela" },
  { code: "CU", flag: "🇨🇺", name: "Cuba" },
  { code: "CO", flag: "🇨🇴", name: "Colombia" },
];

export default function WelcomeRegisterScreen({ onRegisterComplete }) {
  const [step, setStep] = useState("welcome"); // "welcome" | "register"
  const [playerName, setPlayerName] = useState("");
  const [apodo, setApodo] = useState("");
  const [country, setCountry] = useState("DO");
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
  const [nameError, setNameError] = useState("");

  const handleGoogleSignIn = async () => {
    setIsLoadingGoogle(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      onRegisterComplete(
        result.user.displayName || "Socio",
        "",
        result.user
      );
    } catch (e) {
      console.error("Google sign-in error:", e);
      alert(`Error con Google: ${e.message || e}`);
    } finally {
      setIsLoadingGoogle(false);
    }
  };

  const handleGuestRegister = () => {
    if (!playerName.trim() || playerName.trim().length < 2) {
      setNameError("El nombre debe tener al menos 2 caracteres.");
      return;
    }
    setNameError("");
    onRegisterComplete(playerName.trim(), apodo.trim(), null);
  };

  const randomApodo = () => {
    const random = DOMINICAN_APODOS[Math.floor(Math.random() * DOMINICAN_APODOS.length)];
    setApodo(random);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background ambient effect */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-amber-600/10 rounded-full blur-[80px]" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[200px] bg-red-700/10 rounded-full blur-[60px]" />
      </div>

      <AnimatePresence mode="wait">
        {step === "welcome" && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="relative z-10 w-full max-w-md space-y-8 text-center"
          >
            {/* Logo */}
            <div className="space-y-3">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-tr from-amber-500 to-red-600 rounded-3xl shadow-[0_0_40px_rgba(245,158,11,0.3)] mx-auto">
                <span className="text-4xl">🔥</span>
              </div>
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-gradient-to-r from-white via-amber-200 to-amber-500 bg-clip-text">
                  Dominosfire
                </h1>
                <p className="text-amber-500 font-mono text-xs uppercase tracking-widest mt-1">
                  El Mambo del Dominó — Multiplayer Online
                </p>
              </div>
            </div>

            {/* Feature highlights */}
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { icon: "🎮", label: "1v1 & 2v2" },
                { icon: "🏆", label: "Torneos" },
                { icon: "💎", label: "Web3 NFTs" },
              ].map((f) => (
                <div key={f.label} className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 space-y-1">
                  <span className="text-2xl">{f.icon}</span>
                  <p className="text-[11px] font-bold text-neutral-300">{f.label}</p>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="space-y-3">
              <button
                onClick={() => setStep("register")}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-red-600 text-black font-extrabold text-sm rounded-2xl hover:brightness-110 active:scale-95 transition-all shadow-[0_4px_20px_rgba(245,158,11,0.3)] cursor-pointer"
              >
                🎲 Comenzar a Jugar
              </button>
              <p className="text-[11px] text-neutral-500">
                Gratis para siempre • Sin descargas • Juega desde el navegador
              </p>
            </div>

            {/* Dominoes decorative row */}
            <div className="flex justify-center gap-2 opacity-20 pointer-events-none select-none">
              {[[6,6],[5,4],[3,2],[0,1],[4,4]].map((tile, i) => (
                <div key={i} className="w-7 h-12 border border-neutral-500 rounded bg-neutral-900 flex flex-col items-center justify-center gap-0.5 text-[8px] font-mono text-neutral-400">
                  <span>{tile[0]}</span>
                  <div className="w-full h-[1px] bg-neutral-600" />
                  <span>{tile[1]}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {step === "register" && (
          <motion.div
            key="register"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="relative z-10 w-full max-w-md space-y-5"
          >
            {/* Header */}
            <div className="text-center space-y-1">
              <h2 className="text-xl font-extrabold text-white">Crea tu Perfil Quisqueyano</h2>
              <p className="text-xs text-neutral-400">Elige tu apodo y entra al colmado digital.</p>
            </div>

            {/* Google Sign In (preferred) */}
            <div className="bg-neutral-900 border border-violet-500/20 rounded-2xl p-5 space-y-4">
              <div className="space-y-1">
                <span className="text-[9px] bg-violet-500/20 text-violet-300 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Recomendado
                </span>
                <h3 className="text-sm font-bold text-white">Ingresa con Google</h3>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  Guarda tu progreso, monedas y ranking en la nube de forma permanente.
                </p>
              </div>
              <button
                onClick={handleGoogleSignIn}
                disabled={isLoadingGoogle}
                className="w-full py-3 px-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 text-white font-extrabold text-xs rounded-xl transition-all shadow-[0_4px_12px_rgba(109,40,217,0.3)] active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoadingGoogle ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Conectando...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.7 0 3.25.61 4.45 1.615l2.42-2.42C17.435 1.74 14.935 1 12.24 1c-5.52 0-10 4.48-10 10s4.48 10 10 10c5.77 0 10-4.06 10-10 0-.675-.075-1.32-.215-1.715H12.24z"/>
                    </svg>
                    Continuar con Google
                  </>
                )}
              </button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-[1px] bg-neutral-800" />
              <span className="text-[11px] text-neutral-500 font-bold uppercase tracking-widest">o juega como invitado</span>
              <div className="flex-1 h-[1px] bg-neutral-800" />
            </div>

            {/* Guest form */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
              {/* Name input */}
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase font-bold text-neutral-400 tracking-wider">
                  Tu Nombre de Jugador *
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => {
                    setPlayerName(e.target.value);
                    setNameError("");
                  }}
                  placeholder="Ej: Manolo, La China, El Cañero..."
                  maxLength={24}
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 text-white text-sm p-3 rounded-xl outline-none transition-colors placeholder:text-neutral-600"
                />
                {nameError && (
                  <p className="text-[11px] text-red-400">{nameError}</p>
                )}
              </div>

              {/* Apodo input */}
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase font-bold text-neutral-400 tracking-wider">
                  Apodo Dominicano (opcional)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={apodo}
                    onChange={(e) => setApodo(e.target.value)}
                    placeholder="Ej: El Mudo, La Loma..."
                    maxLength={20}
                    className="flex-1 bg-neutral-950 border border-neutral-800 focus:border-amber-500 text-white text-sm p-3 rounded-xl outline-none transition-colors placeholder:text-neutral-600"
                  />
                  <button
                    type="button"
                    onClick={randomApodo}
                    className="px-3 bg-neutral-800 hover:bg-neutral-700 text-amber-400 text-xs font-bold rounded-xl transition-all cursor-pointer border border-neutral-700 hover:border-amber-500/30"
                    title="Apodo aleatorio"
                  >
                    🎲
                  </button>
                </div>
              </div>

              {/* Country selector */}
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase font-bold text-neutral-400 tracking-wider">
                  País de Origen
                </label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 text-white text-sm p-3 rounded-xl outline-none transition-colors cursor-pointer"
                >
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Submit */}
              <button
                onClick={handleGuestRegister}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-red-600 text-black font-extrabold text-sm rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-[0_4px_15px_rgba(245,158,11,0.2)] cursor-pointer mt-2"
              >
                🎲 Entrar al Colmado
              </button>
            </div>

            {/* Back button */}
            <button
              onClick={() => setStep("welcome")}
              className="w-full text-center text-xs text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer py-1"
            >
              ← Volver al inicio
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
