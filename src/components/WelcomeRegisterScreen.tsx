import React, { useState } from "react";
import { auth, googleProvider } from "../lib/firebase.js";
import { signInWithPopup } from "firebase/auth";
import { Flame, User, Keyboard, ShieldAlert, CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";

interface WelcomeRegisterScreenProps {
  onRegisterComplete: (name: string, apodo: string, googleUser: any | null) => void;
}

export default function WelcomeRegisterScreen({ onRegisterComplete }: WelcomeRegisterScreenProps) {
  const [name, setName] = useState("");
  const [apodo, setApodo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Dominican nickname generator for fun suggestions
  const APODO_SUGGESTIONS = [
    "La Fiera", "El Verdugo", "Capicuador", "Doble Seis", 
    "El Tíguere", "Copa Caoba", "El Duro de Villa", "El Mudo de Herrera"
  ];

  const handleManualRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Por favor, ingresa tu nombre completo.");
      return;
    }
    setError(null);
    setIsLoading(true);
    
    setTimeout(() => {
      setIsLoading(false);
      onRegisterComplete(name.trim(), apodo.trim(), null);
    }, 800);
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      onRegisterComplete(
        result.user.displayName || "Google Player", 
        "", 
        result.user
      );
    } catch (err: any) {
      console.error("Popup sign-in error", err);
      setError("No se pudo iniciar sesión con Google. Inténtalo de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  const selectRandomApodo = () => {
    const random = APODO_SUGGESTIONS[Math.floor(Math.random() * APODO_SUGGESTIONS.length)];
    setApodo(random);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center relative p-4 overflow-hidden select-none font-sans">
      
      {/* Decorative Warm Fire Background Lights */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-red-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-10 left-1/3 w-80 h-80 bg-amber-600/5 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Floating Decorative Tiles (Vector SVGs) */}
      <div className="absolute top-12 left-10 opacity-10 rotate-12 hidden md:block">
        <div className="w-12 h-20 bg-neutral-800 border border-neutral-700 rounded-lg flex flex-col justify-between p-1.5">
          <div className="w-2 h-2 bg-neutral-400 rounded-full mx-auto"></div>
          <div className="w-2 h-2 bg-neutral-400 rounded-full mx-auto"></div>
          <div className="h-[1px] w-full bg-neutral-600"></div>
          <div className="w-2 h-2 bg-neutral-400 rounded-full mx-auto"></div>
          <div className="w-2 h-2 bg-neutral-400 rounded-full mx-auto"></div>
        </div>
      </div>

      <div className="absolute bottom-16 right-16 opacity-10 -rotate-45 hidden md:block">
        <div className="w-20 h-12 bg-neutral-800 border border-neutral-700 rounded-lg flex justify-between p-1.5 items-center">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-neutral-400 rounded-full"></div>
            <div className="w-2 h-2 bg-neutral-400 rounded-full"></div>
          </div>
          <div className="w-[1px] h-full bg-neutral-600"></div>
          <div className="flex gap-1 col-span-1">
            <div className="w-2 h-2 bg-neutral-400 rounded-full"></div>
            <div className="w-2 h-2 bg-neutral-400 rounded-full"></div>
          </div>
        </div>
      </div>

      {/* Main Registration Container */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md bg-neutral-900/90 border border-neutral-800 rounded-2xl p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-md relative z-10"
      >
        {/* Dominosfire Branding */}
        <div className="text-center space-y-2 mb-8">
          <div className="inline-flex items-center gap-1.5 bg-gradient-to-r from-red-500 to-amber-500 text-black px-4 py-1.5 rounded-full font-bold text-xs tracking-wider uppercase shadow-[0_0_20px_rgba(239,68,68,0.2)]">
            <Flame className="w-4 h-4 animate-bounce shrink-0" />
            <span>Dominosfire</span>
          </div>
          
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-b from-white via-neutral-100 to-neutral-400 bg-clip-text text-transparent">
            ¡Prepárate para la Mesa!
          </h1>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto leading-relaxed">
            Ingresa a Dominosfire, regístrate con un apodo bien criollo dominicano para que te respeten en el colmado, o sincroniza tu cuenta de Google.
          </p>
        </div>

        {/* Error Alert Display */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mb-4 bg-red-950/40 text-red-400 p-3 rounded-xl border border-red-800/40 text-xs flex gap-2 items-center"
          >
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}

        <div className="space-y-6">
          
          {/* Manual Input Form */}
          <form onSubmit={handleManualRegister} className="space-y-4">
            
            <div className="space-y-1.5">
              <label className="text-xs text-neutral-400 font-bold uppercase tracking-wider block">
                Nombre Completo
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                  <User className="w-4 h-4" />
                </div>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ej: Juan Pérez"
                  className="w-full pl-10 pr-4 py-3 bg-neutral-950 border border-neutral-800 hover:border-neutral-700 focus:border-amber-500 rounded-xl text-sm transition-all focus:ring-1 focus:ring-amber-500 text-white outline-none"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs text-neutral-400 font-bold uppercase tracking-wider block">
                  Apodo / Nickname (Opcional)
                </label>
                <button
                  type="button"
                  onClick={selectRandomApodo}
                  className="text-[10px] text-amber-500 font-semibold hover:underline cursor-pointer"
                  disabled={isLoading}
                >
                  Generar Uno 🎲
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                  <Keyboard className="w-4 h-4" />
                </div>
                <input 
                  type="text" 
                  value={apodo}
                  onChange={(e) => setApodo(e.target.value)}
                  placeholder="ej: El Verdugo, Capicuador"
                  className="w-full pl-10 pr-4 py-3 bg-neutral-950 border border-neutral-800 hover:border-neutral-700 focus:border-amber-500 rounded-xl text-sm transition-all focus:ring-1 focus:ring-amber-500 text-white outline-none font-medium text-amber-400 placeholder:text-neutral-600"
                  disabled={isLoading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !name.trim()}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-red-600 hover:brightness-110 disabled:opacity-50 text-black font-extrabold text-sm rounded-xl transition-all shadow-[0_4px_15px_rgba(245,158,11,0.25)] hover:shadow-[0_4px_22px_rgba(245,158,11,0.4)] active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isLoading ? "PROCESANDO..." : "¡ENTRAR A JUGAR!"}</span>
            </button>
          </form>

          {/* Divider line OR */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-[1px] bg-neutral-800"></div>
            <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">ó ingresa con</span>
            <div className="flex-1 h-[1px] bg-neutral-800"></div>
          </div>

          {/* Google SSO Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full py-3 bg-neutral-950 border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900 text-neutral-100 font-bold text-xs rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow-md"
          >
            <svg className="w-4 h-4 mr-0.5" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.7 0 3.25.61 4.45 1.615l2.42-2.42C17.435 1.74 14.935 1 12.24 1c-5.52 0-10 4.48-10 10s4.48 10 10 10c5.77 0 10-4.06 10-10 0-.675-.075-1.32-.215-1.715H12.24z"/>
            </svg>
            <span>REGISTRARSE CON GOOGLE</span>
          </button>
        </div>

        {/* Humorous sub-footing */}
        <p className="text-[10px] text-neutral-500 text-center mt-6">
          "El dominó fue inventado por un mudo, así que juegue callao'."
        </p>
      </motion.div>
    </div>
  );
}
