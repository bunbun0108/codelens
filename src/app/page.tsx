"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { parseGitHubUrl } from "../shared/github-url";
import { MatrixBackground } from "../components/landing/matrix-background";

// ── Palette tokens ─────────────────────────────────────────────────────────
// Landing bg exception: #030504 (D-019). #241D01 is NOT used on landing page.
const AQUA    = "#AFFDF0"; // Icy Aqua  – primary text / title
const GREEN   = "#BEEF8D"; // Light Green – caret / ">" marker
const TEAL    = "#3A745D"; // Deep Teal  – border / accents
const LBG     = "#030504"; // Landing background (D-019)

// ── Typing animation ───────────────────────────────────────────────────────
const TITLE_TEXT = "CodeLens";
const CHAR_DELAY = 140; // ms per character

// ── Example links ──────────────────────────────────────────────────────────
const EXAMPLES = [
  { label: "$ try prisma/prisma-examples", href: "/r/prisma/prisma-examples" },
  { label: "$ try vercel/next.js /tree/canary/examples", href: "/r/vercel/next.js?ref=canary%2Fexamples" },
] as const;

export default function LandingPage() {
  const [url,   setUrl]   = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // ── Reduced-motion: read synchronously on first render via lazy initializer,
  // then keep in sync via MQ listener (callback form is lint-safe).
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  // ── Animation state ────────────────────────────────────────────────────
  const [typedCount,    setTypedCount]    = useState(0);
  const [showSubtitle,  setShowSubtitle]  = useState(false);
  const [showPanel,     setShowPanel]     = useState(false);
  const [showLinks,     setShowLinks]     = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  // Keep reduced in sync when the user toggles OS preference at runtime.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Only subscribe; never call setState in the effect body.
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced) {
      // Deferred to avoid set-state-in-effect lint rule.
      const id = setTimeout(() => {
        setTypedCount(TITLE_TEXT.length);
        setShowSubtitle(true);
        setShowPanel(true);
        setShowLinks(true);
      }, 0);
      return () => clearTimeout(id);
    }

    let count = 0;
    const typeInterval = setInterval(() => {
      count += 1;
      setTypedCount(count);
      if (count >= TITLE_TEXT.length) {
        clearInterval(typeInterval);
        setTimeout(() => setShowSubtitle(true), 300);
        setTimeout(() => setShowPanel(true),    700);
        setTimeout(() => setShowLinks(true),   1100);
      }
    }, CHAR_DELAY);

    return () => clearInterval(typeInterval);
  }, [reduced]);


  // Blinking cursor: 530ms on/off
  useEffect(() => {
    const id = setInterval(() => setCursorVisible((v) => !v), 530);
    return () => clearInterval(id);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!url.trim()) return;
    try {
      const parsed = parseGitHubUrl(url.trim());
      const params = new URLSearchParams();
      if (parsed.treeSegments.length > 0) {
        params.set("ref", parsed.treeSegments.join("/"));
      }
      const qs = params.toString();
      router.push(`/r/${parsed.owner}/${parsed.repo}${qs ? `?${qs}` : ""}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid GitHub URL.");
    }
  };

  const noTransition = reduced ? "none" : undefined;

  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center p-4 overflow-hidden"
      style={{ backgroundColor: LBG }}
    >
      {/* Matrix canvas background – z-index 0 */}
      <MatrixBackground />

      {/* Content – z-index 2 */}
      <div
        className="relative z-[2] flex flex-col items-center gap-8"
        style={{ width: "clamp(640px, 80vw, 820px)", maxWidth: "calc(100vw - 2rem)" }}
      >

        {/* ── Title ──────────────────────────────────────────────────────── */}
        <div className="text-center select-none" aria-label="CodeLens Repository Explorer">
          <h1
            style={{
              fontFamily: "var(--font-orbitron), sans-serif",
              fontSize: "clamp(64px, 10vw, 128px)",
              fontWeight: 800,
              letterSpacing: "0.04em",
              color: AQUA,
              textShadow: `0 0 20px ${AQUA}66, 0 0 60px ${AQUA}33`,
              lineHeight: 1,
              minHeight: "1.1em",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-hidden="true"
          >
            <span>{TITLE_TEXT.slice(0, typedCount)}</span>
            {/* Block cursor – always shown after title, blinking */}
            <span
              style={{
                display: "inline-block",
                width: showPanel ? "0.4em" : "0.55em",
                height: showPanel ? "0.7em" : "0.85em",
                backgroundColor: GREEN,
                marginLeft: "0.06em",
                verticalAlign: "middle",
                opacity: cursorVisible ? 1 : 0,
                transition: "opacity 0.05s",
                borderRadius: "2px",
              }}
            />
          </h1>

          {/* Subtitle */}
          <p
            style={{
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: "0.7rem",
              letterSpacing: "0.25em",
              color: TEAL,
              marginTop: "0.6rem",
              textTransform: "uppercase",
              opacity: showSubtitle ? 1 : 0,
              transition: noTransition ?? "opacity 0.6s ease",
            }}
          >
            Repository Explorer
          </p>
        </div>

        {/* ── Prompt panel ───────────────────────────────────────────────── */}
        <div
          style={{
            width: "100%",
            borderRadius: "2px",
            // Glass: base dark + Deep Teal tint ~15%
            background: `linear-gradient(135deg, rgba(3,5,4,0.55) 0%, rgba(58,116,93,0.15) 100%)`,
            backdropFilter: "blur(16px) saturate(120%)",
            WebkitBackdropFilter: "blur(16px) saturate(120%)",
            // 1px Deep Teal border ~60% + faint Aqua top highlight ~8%
            border: `1px solid ${TEAL}99`,
            borderTop: `1px solid ${AQUA}14`,
            // Outer glow: Deep Teal ~25%
            boxShadow: `0 0 40px ${TEAL}40, 0 8px 32px rgba(3,5,4,0.6)`,
            padding: "32px",
            opacity: showPanel ? 1 : 0,
            transform: showPanel ? "translateY(0)" : "translateY(12px)",
            transition: noTransition ?? "opacity 0.5s ease, transform 0.5s ease",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: "12px",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: `${AQUA}b3`,
              marginBottom: "1.25rem",
            }}
          >
            Paste a GitHub repository URL
          </p>

          <form onSubmit={handleSubmit}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                paddingBottom: "12px",
                borderBottom: `1px solid ${TEAL}40`,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  color: GREEN,
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                  fontWeight: 700,
                  fontSize: "20px",
                  flexShrink: 0,
                  userSelect: "none",
                  lineHeight: 1,
                }}
              >
                &gt;
              </span>

              <input
                id="repo-url-input"
                type="text"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(null); }}
                placeholder="github.com/owner/repo or /tree/branch/path"
                spellCheck={false}
                autoComplete="off"
                autoFocus={showPanel}
                className="landing-input"
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: AQUA,
                  caretColor: GREEN,
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                  fontSize: "20px",
                }}
              />
            </div>

            <p
              style={{
                fontFamily: "var(--font-jetbrains-mono), monospace",
                fontSize: "13px",
                color: `${AQUA}99`,
                textAlign: "right",
                marginTop: "12px",
              }}
            >
              Press <kbd style={{ opacity: 0.6 }}>Enter</kbd> to explore
            </p>

            {error && (
              <p
                role="alert"
                style={{
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                  fontSize: "0.7rem",
                  color: GREEN,
                  marginTop: "0.75rem",
                }}
              >
                {error}
              </p>
            )}
          </form>
        </div>

        {/* ── Example links ──────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            width: "100%",
            // Blurred dark backdrop so matrix doesn't run through text
            background: `rgba(3,5,4,0.50)`,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            borderRadius: "2px",
            padding: "12px 16px",
            opacity: showLinks ? 1 : 0,
            transition: noTransition ?? "opacity 0.5s ease",
          }}
        >
          {EXAMPLES.map((ex, i) => (
            <ExampleLink key={ex.href} href={ex.href} label={ex.label} index={i} reduced={reduced} />
          ))}
        </div>

        {/* Status line */}
        <p
          style={{
            fontFamily: "var(--font-jetbrains-mono), monospace",
            fontSize: "13px",
            color: `${AQUA}60`,
            textAlign: "center",
            userSelect: "none",
            opacity: showLinks ? 0.8 : 0,
            transition: noTransition ?? "opacity 0.5s ease",
          }}
        >
          Public GitHub repos only · No sign-in required
        </p>
      </div>

      {/* Float keyframes */}
      {!reduced && (
        <style>{`
          @keyframes float-a {
            0%, 100% { transform: translateY(0px); }
            50%       { transform: translateY(-4px); }
          }
          @keyframes float-b {
            0%, 100% { transform: translateY(0px); }
            50%       { transform: translateY(4px); }
          }
        `}</style>
      )}
    </main>
  );
}

// ── Extracted to avoid reading ref during render ───────────────────────────
function ExampleLink({
  href, label, index, reduced,
}: {
  href: string;
  label: string;
  index: number;
  reduced: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const anim = index % 2 === 0 ? "float-a" : "float-b";
  const duration = `${4.5 + index * 0.5}s`;

  return (
    <a
      href={href}
      style={{
        fontFamily: "var(--font-jetbrains-mono), monospace",
        fontSize: "14px",
        color: hovered ? "#AFFDF0" : `#AFFDF0bf`,
        textDecoration: "none",
        display: "block",
        transition: "color 0.2s ease",
        animation: reduced ? "none" : `${anim} ${duration} ease-in-out infinite`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {label}
    </a>
  );
}

