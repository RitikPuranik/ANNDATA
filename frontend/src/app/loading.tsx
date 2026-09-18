import { LogoMark } from "@/components/Logo";

export default function Loading() {
  return (
    <main className="route-loading" aria-label="Loading page">
      <div className="route-loading-brand">
        <LogoMark className="h-5 w-5" />
      </div>
    </main>
  );
}
