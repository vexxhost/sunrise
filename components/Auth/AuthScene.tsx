import { SunriseBrand } from "@/components/Brand/SunriseBrand";

function VectorCloudscape() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <svg
        className="sunrise-parallax-sun absolute inset-0 size-full"
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <circle
          cx="1190"
          cy="250"
          r="108"
          fill="var(--sunrise-auth-sun)"
          opacity="0.82"
        />
        <path
          d="M930 360h520"
          fill="none"
          stroke="var(--sunrise-auth-horizon)"
          strokeLinecap="round"
          strokeWidth="5"
          opacity="0.7"
        />
      </svg>

      <svg
        className="sunrise-parallax-back absolute -left-[5%] top-0 h-full w-[110%]"
        viewBox="0 0 1760 900"
        preserveAspectRatio="none"
      >
        <path
          d="M-80 590C140 510 310 560 470 520s330-120 510-45 300 45 470-30 300-50 390 20v435H-80Z"
          fill="var(--sunrise-auth-cloud-back)"
        />
      </svg>

      <svg
        className="sunrise-parallax-mid absolute -left-[5%] top-0 h-full w-[110%]"
        viewBox="0 0 1760 900"
        preserveAspectRatio="none"
      >
        <path
          d="M-80 680c170-105 340-30 500-80s280-65 450 15 330-35 500-15 270 95 470 5v295H-80Z"
          fill="var(--sunrise-auth-cloud-mid)"
        />
        <path
          d="M1080 640h410"
          fill="none"
          stroke="var(--sunrise-auth-accent)"
          strokeLinecap="round"
          strokeWidth="4"
          opacity="0.55"
        />
      </svg>

      <svg
        className="sunrise-parallax-front absolute -left-[5%] top-0 h-full w-[110%]"
        viewBox="0 0 1760 900"
        preserveAspectRatio="none"
      >
        <path
          d="M-80 760c180-70 350-30 510 20s320-80 510-25 310 120 500 40 290-50 400-5v110H-80Z"
          fill="var(--sunrise-auth-cloud-front)"
        />
      </svg>

      <div className="absolute inset-0 bg-[var(--sunrise-auth-overlay)]" />
    </div>
  );
}

export function AuthScene({ children }: { children: React.ReactNode }) {
  return (
    <main className="sunrise-auth-scene relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--sunrise-auth-sky)] px-4 py-12 text-slate-950 sm:px-6 dark:text-slate-50">
      <VectorCloudscape />

      <section className="relative w-full max-w-md rounded-md border border-slate-950/10 bg-white/85 p-7 shadow-2xl shadow-slate-900/15 backdrop-blur-md sm:p-10 dark:border-white/12 dark:bg-[#091520]/90 dark:shadow-black/30">
        <SunriseBrand className="justify-center text-slate-950 dark:text-white" />
        <div className="mt-9">{children}</div>
      </section>
    </main>
  );
}
