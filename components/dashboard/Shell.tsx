/** Page shell: background orbs + app container. Server component. */
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Decorative background orbs */}
      <div
        className="fixed -top-[18%] -left-[8%] w-[55%] aspect-square rounded-full pointer-events-none z-0"
        style={{
          filter: 'blur(90px)',
          background: 'radial-gradient(circle, oklch(0.32 0.18 250 / 0.18), transparent 70%)',
        }}
      />
      <div
        className="fixed -bottom-[20%] -right-[10%] w-[50%] aspect-square rounded-full pointer-events-none z-0"
        style={{
          filter: 'blur(90px)',
          background: 'radial-gradient(circle, oklch(0.32 0.18 290 / 0.15), transparent 70%)',
        }}
      />
      <div
        className="fixed top-[30%] left-[40%] w-[42%] aspect-square rounded-full pointer-events-none z-0"
        style={{
          filter: 'blur(110px)',
          background: 'radial-gradient(circle, oklch(0.35 0.14 165 / 0.09), transparent 70%)',
        }}
      />

      {/* App container. No scaling here: text size follows the OS display
          scaling / browser zoom, and layouts reflow via the .home-grid /
          .layout-* classes in globals.css. */}
      <div
        className="relative z-10 flex flex-col pb-7"
        style={{ paddingInline: 'var(--gutter)', minHeight: 'calc(100dvh - var(--demo-banner-h, 0px))' }}
      >
        {children}
      </div>
    </>
  )
}
