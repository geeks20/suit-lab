"use client";

import { useEffect, useState } from "react";

const MESSAGES = ["Preparing your model…", "Getting the proportions right…", "Setting up your studio…"];

export function Preparing({ photo }: { photo: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, MESSAGES.length - 1)), 1300);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col items-center gap-8 py-8 text-center">
      <div className="relative aspect-[4/5] w-56 overflow-hidden rounded-[2px] bg-stone sm:w-64">
        {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
        <img src={photo} alt="" className="h-full w-full object-cover opacity-80" />
        <div aria-hidden className="absolute inset-y-0 left-0 w-1/2 animate-sweep bg-gradient-to-r from-transparent via-ivory/40 to-transparent" />
      </div>
      <p aria-live="polite" key={i} className="animate-fade-in font-serif text-3xl">
        {MESSAGES[i]}
      </p>
    </div>
  );
}
