"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function DashboardError({ reset }: { reset: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <main>
      <h1>Trading Core</h1>
      <p role="alert">Не удалось загрузить данные терминала.</p>
      <button
        type="button"
        disabled={pending}
        className="self-start rounded-lg border border-white/20 px-4 py-2"
        onClick={() => startTransition(() => {
          router.refresh();
          reset();
        })}
      >
        {pending ? "Загрузка…" : "Повторить"}
      </button>
    </main>
  );
}
