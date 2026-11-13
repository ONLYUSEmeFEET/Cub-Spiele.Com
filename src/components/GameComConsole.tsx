import React, { useState } from 'react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { GameComButtons } from '../emulator/types';
import { LCDScreen } from './LCDScreen';
import { Volume2, VolumeX, RotateCcw } from 'lucide-react';

interface GameComConsoleProps {
  system: GameComSystem;
  scale?: number;
  onOpenLibrary?: () => void;
  onFpsUpdate?: (fps: number) => void;
  onStateChange?: () => void;
}

export const GameComConsole: React.FC<GameComConsoleProps> = ({
  system,
  scale = 2.35,
  onFpsUpdate,
  onStateChange
}) => {
  const [pressedButtons, setPressedButtons] = useState<Partial<GameComButtons>>({});
  const [contrastValue, setContrastValue] = useState(system.settings.contrast);
  const [viewportWidth, setViewportWidth] = useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );

  React.useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const effectiveScale =
    viewportWidth < 420 ? Math.min(scale, 1.45) : viewportWidth < 600 ? Math.min(scale, 1.85) : scale;

  const handleBtnPress = (btn: keyof GameComButtons) => {
    setPressedButtons((prev) => ({ ...prev, [btn]: true }));
    system.setButton(btn, true);
    onStateChange?.();
  };

  const handleBtnRelease = (btn: keyof GameComButtons) => {
    setPressedButtons((prev) => ({ ...prev, [btn]: false }));
    system.setButton(btn, false);
    onStateChange?.();
  };

  const handleContrastWheel = (delta: number) => {
    const next = Math.max(0.65, Math.min(1.45, Number((contrastValue + delta).toFixed(2))));
    setContrastValue(next);
    system.settings.contrast = next;
    onStateChange?.();
  };

  return (
    <div className="relative flex flex-col items-center select-none">
      {/* ===================================================================== */}
      {/* MAIN TIGER GAME.COM HANDHELD SHELL (AUTHENTIC CHARCOAL-SLATE ABS)     */}
      {/* ===================================================================== */}
      <div
        className="relative z-10 rounded-[48px] p-6 sm:p-8 border-[3px] border-[#3d414d] transition-all"
        style={{
          background:
            'radial-gradient(120% 100% at 50% 8%, #343842 0%, #262931 48%, #1b1e24 100%)',
          boxShadow:
            '0 30px 70px -15px rgba(0, 0, 0, 0.92), inset 0 2px 3px rgba(255, 255, 255, 0.16), inset 0 -10px 22px rgba(0, 0, 0, 0.85), inset 4px 0 10px rgba(255, 255, 255, 0.04)'
        }}
      >
        {/* Left & Right Molded Ergonomic Hand-Grip Contours & Rubberized Side Ribs */}
        <div className="pointer-events-none absolute left-0 top-16 bottom-16 w-4 flex flex-col justify-center gap-3 pl-1">
          <div className="w-2 h-8 rounded-r-full bg-[#15171c] shadow-[inset_0_1px_2px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.07)]" />
          <div className="w-2 h-8 rounded-r-full bg-[#15171c] shadow-[inset_0_1px_2px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.07)]" />
          <div className="w-2 h-8 rounded-r-full bg-[#15171c] shadow-[inset_0_1px_2px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.07)]" />
        </div>
        <div className="pointer-events-none absolute right-0 top-16 bottom-16 w-4 flex flex-col justify-center gap-3 items-end pr-1">
          <div className="w-2 h-8 rounded-l-full bg-[#15171c] shadow-[inset_0_1px_2px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.07)]" />
          <div className="w-2 h-8 rounded-l-full bg-[#15171c] shadow-[inset_0_1px_2px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.07)]" />
          <div className="w-2 h-8 rounded-l-full bg-[#15171c] shadow-[inset_0_1px_2px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.07)]" />
        </div>

        {/* Top Embossed Mold Seam & CUB SPIELE.COM Branding */}
        <div className="flex items-center justify-between px-8 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black tracking-[0.28em] text-[#8d93a1]/80 uppercase drop-shadow-[0_1px_0_rgba(0,0,0,0.9)]">
              CUB SPIELE.COM
            </span>
          </div>
          <div className="h-[2px] flex-1 mx-6 rounded-full bg-[#17191f] shadow-[0_1px_0_rgba(255,255,255,0.07)]" />
          <div className="text-[9px] font-mono tracking-[0.2em] text-[#8d93a1]/75 uppercase">
            HANDHELD SYSTEM
          </div>
        </div>

        {/* ================================================================= */}
        {/* MAIN HORIZONTAL CONSOLE DECK: LEFT WING | SCREEN BEZEL | RIGHT WING */}
        {/* ================================================================= */}
        <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-7">
          {/* --------------------------------------------------------------- */}
          {/* LEFT WING: POWER LED, SYSTEM PILL KEYS, 8-WAY DISH D-PAD, SPEAKER */}
          {/* --------------------------------------------------------------- */}
          <div className="flex flex-row lg:flex-col items-center justify-between w-full lg:w-44 gap-4 py-1">
            {/* Top-Left System Button Column + Power LED */}
            <div className="flex items-start justify-between w-full px-2 gap-3">
              {/* Power Indicator LED & Contrast Thumbwheel Column */}
              <div className="flex flex-col items-center gap-3 pt-1">
                {/* Recessed Ruby Power LED */}
                <div className="flex flex-col items-center gap-1">
                  <div className="w-5 h-5 rounded-full bg-[#14161b] p-1 flex items-center justify-center shadow-[inset_0_2px_4px_rgba(0,0,0,0.9)] border border-[#343844]">
                    <div
                      className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                        system.isPoweredOn
                          ? 'bg-[#ef4444] shadow-[0_0_10px_#ef4444,inset_0_1px_1px_#fecaca]'
                          : 'bg-[#451a1c]'
                      }`}
                    />
                  </div>
                  <span className="text-[8px] font-black tracking-[0.16em] text-[#9ca3af] uppercase">
                    POWER
                  </span>
                </div>

                {/* Tactile Ribbed Contrast Wheel */}
                <div className="flex flex-col items-center gap-1 mt-1" title="Adjust STN LCD Contrast">
                  <div className="flex flex-col items-center bg-[#13151a] p-1 rounded-md border border-[#323641] shadow-inner">
                    <button
                      onClick={() => handleContrastWheel(0.08)}
                      className="w-4 h-3 text-[8px] leading-none text-[#9ca3af] hover:text-white flex items-center justify-center"
                      title="Increase Contrast"
                    >
                      ▲
                    </button>
                    <div className="w-3.5 h-6 rounded-[2px] bg-gradient-to-b from-[#3f4452] via-[#252830] to-[#3f4452] flex flex-col justify-between py-0.5 px-0.5 border border-black/60">
                      <div className="h-[1px] bg-black/80" />
                      <div className="h-[1px] bg-black/80" />
                      <div className="h-[1px] bg-black/80" />
                      <div className="h-[1px] bg-black/80" />
                    </div>
                    <button
                      onClick={() => handleContrastWheel(-0.08)}
                      className="w-4 h-3 text-[8px] leading-none text-[#9ca3af] hover:text-white flex items-center justify-center"
                      title="Decrease Contrast"
                    >
                      ▼
                    </button>
                  </div>
                  <span className="text-[7px] font-mono tracking-wider text-[#8d93a1] uppercase">
                    CONTRAST
                  </span>
                </div>
              </div>

              {/* Authentic Vertical Pill System Keys (ON/OFF, MENU, PAUSE, SOUND, RESET) */}
              <div className="flex flex-col items-end gap-2">
                {/* Crimson ON/OFF Key */}
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-black tracking-[0.14em] text-[#d1d5db] uppercase">
                    ON/OFF
                  </span>
                  <button
                    onClick={() => {
                      system.powerToggle();
                      onStateChange?.();
                    }}
                    className="w-11 h-5 rounded-full bg-gradient-to-b from-[#be123c] to-[#881337] hover:from-[#e11d48] hover:to-[#9f1239] active:translate-y-0.5 border border-[#4c0519] shadow-[0_2px_4px_rgba(0,0,0,0.75),inset_0_1px_1px_rgba(255,255,255,0.25)]"
                    title="Power On / Off (Cold Boot)"
                  />
                </div>

                {/* MENU Pill Button */}
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-black tracking-[0.14em] text-[#c4c9d4] uppercase">
                    MENU
                  </span>
                  <button
                    onPointerDown={() => handleBtnPress('menu')}
                    onPointerUp={() => handleBtnRelease('menu')}
                    onPointerLeave={() => pressedButtons.menu && handleBtnRelease('menu')}
                    className={`w-11 h-4.5 rounded-full border border-[#14161b] transition-transform ${
                      pressedButtons.menu
                        ? 'translate-y-0.5 bg-[#252830] shadow-inner'
                        : 'bg-gradient-to-b from-[#434857] to-[#2a2d37] shadow-[0_2px_3px_rgba(0,0,0,0.75),inset_0_1px_1px_rgba(255,255,255,0.2)]'
                    }`}
                    title="BIOS Main Menu (Enter / M)"
                  />
                </div>

                {/* PAUSE Pill Button */}
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-black tracking-[0.14em] text-[#c4c9d4] uppercase">
                    PAUSE
                  </span>
                  <button
                    onClick={() => {
                      system.pauseToggle();
                      onStateChange?.();
                    }}
                    className={`w-11 h-4.5 rounded-full border border-[#14161b] transition-transform ${
                      system.isPaused
                        ? 'translate-y-0.5 bg-[#b45309] shadow-inner'
                        : 'bg-gradient-to-b from-[#434857] to-[#2a2d37] shadow-[0_2px_3px_rgba(0,0,0,0.75),inset_0_1px_1px_rgba(255,255,255,0.2)]'
                    }`}
                    title="Pause System (P)"
                  />
                </div>

                {/* SOUND Pill Button */}
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-black tracking-[0.14em] text-[#c4c9d4] uppercase">
                    SOUND
                  </span>
                  <button
                    onClick={() => {
                      system.soundToggle();
                      onStateChange?.();
                    }}
                    className={`w-11 h-4.5 rounded-full border border-[#14161b] flex items-center justify-center transition-transform ${
                      system.settings.muted
                        ? 'translate-y-0.5 bg-[#4b1d24] shadow-inner'
                        : 'bg-gradient-to-b from-[#434857] to-[#2a2d37] shadow-[0_2px_3px_rgba(0,0,0,0.75),inset_0_1px_1px_rgba(255,255,255,0.2)]'
                    }`}
                    title="Toggle Internal Speaker Audio"
                  >
                    {system.settings.muted ? (
                      <VolumeX className="w-2.5 h-2.5 text-rose-300" />
                    ) : (
                      <Volume2 className="w-2.5 h-2.5 text-[#cbd5e1]" />
                    )}
                  </button>
                </div>

                {/* Recessed Pinhole RESET Button */}
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-[7px] font-mono tracking-[0.16em] text-[#8d93a1] uppercase">
                    RESET
                  </span>
                  <button
                    onClick={() => {
                      system.resetSystem('MAIN_MENU');
                      onStateChange?.();
                    }}
                    className="w-4 h-4 rounded-full bg-[#15171c] border border-[#383c47] shadow-inner flex items-center justify-center hover:border-[#9ca3af]"
                    title="Hardware Reset ($1020)"
                  >
                    <RotateCcw className="w-2 h-2 text-[#9ca3af]" />
                  </button>
                </div>
              </div>
            </div>

            {/* Authentic 1997 Tiger Game.Com Sculpted Circular-Dish 8-Way Cross D-Pad */}
            <div
              onContextMenu={(e) => e.preventDefault()}
              className="relative w-36 h-36 rounded-full bg-gradient-to-b from-[#1a1c22] to-[#242730] p-2.5 shadow-[inset_0_4px_10px_rgba(0,0,0,0.85),0_1px_1px_rgba(255,255,255,0.08)] border border-[#14161b] flex items-center justify-center my-1 touch-none"
            >
              {/* Inner recessed dish ring */}
              <div className="relative w-full h-full rounded-full bg-gradient-to-br from-[#23262f] via-[#1b1d24] to-[#14161b] shadow-[0_4px_8px_rgba(0,0,0,0.7),inset_0_1px_2px_rgba(255,255,255,0.1)] border border-[#323642]">
                {/* Horizontal & Vertical Cross Arms */}
                <div className="pointer-events-none absolute left-1/2 top-2.5 bottom-2.5 -translate-x-1/2 w-10 rounded-[5px] bg-gradient-to-b from-[#2f333f] via-[#23262f] to-[#1c1f26] border border-[#111318] shadow-md" />
                <div className="pointer-events-none absolute top-1/2 left-2.5 right-2.5 -translate-y-1/2 h-10 rounded-[5px] bg-gradient-to-r from-[#2f333f] via-[#23262f] to-[#1c1f26] border border-[#111318] shadow-md" />

                {/* UP */}
                <button
                  onPointerDown={() => handleBtnPress('up')}
                  onPointerUp={() => handleBtnRelease('up')}
                  onPointerLeave={() => pressedButtons.up && handleBtnRelease('up')}
                  className={`absolute top-1.5 left-1/2 -translate-x-1/2 w-10 h-10 flex items-start justify-center pt-2 rounded-t-[5px] ${
                    pressedButtons.up ? 'translate-y-[1px] brightness-125' : ''
                  }`}
                  aria-label="D-Pad Up"
                >
                  <span
                    className={`w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[9px] ${
                      pressedButtons.up ? 'border-b-[#e11d48]' : 'border-b-[#d1d5db]'
                    }`}
                  />
                </button>

                {/* DOWN */}
                <button
                  onPointerDown={() => handleBtnPress('down')}
                  onPointerUp={() => handleBtnRelease('down')}
                  onPointerLeave={() => pressedButtons.down && handleBtnRelease('down')}
                  className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 w-10 h-10 flex items-end justify-center pb-2 rounded-b-[5px] ${
                    pressedButtons.down ? 'translate-y-[1px] brightness-125' : ''
                  }`}
                  aria-label="D-Pad Down"
                >
                  <span
                    className={`w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[9px] ${
                      pressedButtons.down ? 'border-t-[#e11d48]' : 'border-t-[#d1d5db]'
                    }`}
                  />
                </button>

                {/* LEFT */}
                <button
                  onPointerDown={() => handleBtnPress('left')}
                  onPointerUp={() => handleBtnRelease('left')}
                  onPointerLeave={() => pressedButtons.left && handleBtnRelease('left')}
                  className={`absolute left-1.5 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-start pl-2 rounded-l-[5px] ${
                    pressedButtons.left ? 'translate-x-[1px] brightness-125' : ''
                  }`}
                  aria-label="D-Pad Left"
                >
                  <span
                    className={`w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[9px] ${
                      pressedButtons.left ? 'border-r-[#e11d48]' : 'border-r-[#d1d5db]'
                    }`}
                  />
                </button>

                {/* RIGHT */}
                <button
                  onPointerDown={() => handleBtnPress('right')}
                  onPointerUp={() => handleBtnRelease('right')}
                  onPointerLeave={() => pressedButtons.right && handleBtnRelease('right')}
                  className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-end pr-2 rounded-r-[5px] ${
                    pressedButtons.right ? '-translate-x-[1px] brightness-125' : ''
                  }`}
                  aria-label="D-Pad Right"
                >
                  <span
                    className={`w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[9px] ${
                      pressedButtons.right ? 'border-l-[#e11d48]' : 'border-l-[#d1d5db]'
                    }`}
                  />
                </button>

                {/* Center Concave Thumb Pivot */}
                <div className="pointer-events-none absolute inset-0 m-auto w-7 h-7 rounded-full bg-gradient-to-br from-[#14161b] to-[#272b35] shadow-inner border border-black/40" />
              </div>
            </div>

            {/* Bottom-Left Molded Acoustic Speaker Grille (28mm Internal Speaker Slots) */}
            <div className="hidden lg:flex flex-col items-center gap-1.5 w-full pt-1">
              <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#181a20] border border-[#2c303b] shadow-[inset_0_2px_5px_rgba(0,0,0,0.85)]">
                {[14, 20, 24, 24, 20, 14].map((h, i) => (
                  <div
                    key={i}
                    style={{ height: `${h}px` }}
                    className="w-1.5 rounded-full bg-[#090a0d] shadow-[inset_0_1px_2px_rgba(0,0,0,1),0_1px_0_rgba(255,255,255,0.06)]"
                  />
                ))}
              </div>
              <span className="text-[7px] font-mono tracking-[0.22em] text-[#7c8291] uppercase">
                INTERNAL SPEAKER
              </span>
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* CENTER: AUTHENTIC 1997 TIGER GAME.COM STEPPED SCREEN BEZEL      */}
          {/* --------------------------------------------------------------- */}
          <div
            className="relative rounded-[22px] p-4 sm:p-5 border-[2.5px] border-[#111317]"
            style={{
              background:
                'linear-gradient(180deg, #1b1d23 0%, #14161b 52%, #191c22 100%)',
              boxShadow:
                'inset 0 4px 12px rgba(0, 0, 0, 0.92), 0 2px 1px rgba(255, 255, 255, 0.12), 0 12px 28px rgba(0, 0, 0, 0.65)'
            }}
          >
            {/* Top Inner Bezel Silk-Screened Header: Crimson Pinstripes & game·com Logo */}
            <div className="flex items-center justify-between mb-2.5 px-2">
              <div className="flex flex-col gap-0.5 flex-1">
                <div className="h-[1.5px] w-full bg-gradient-to-r from-transparent via-[#be123c] to-[#be123c]" />
                <div className="h-[1px] w-3/4 self-end bg-gradient-to-r from-transparent to-[#64748b]/60" />
              </div>

              {/* "cub spiele·com" Bezel Emblem */}
              <div className="px-3.5 flex items-baseline gap-0.5 select-none">
                <span
                  className="text-base sm:text-lg font-black italic tracking-tight text-[#a3ae76] mr-1"
                  style={{ textShadow: '0 2px 4px rgba(0,0,0,0.85)' }}
                >
                  cub
                </span>
                <span
                  className="text-lg sm:text-xl font-black italic tracking-tight text-[#f1f5f9]"
                  style={{ textShadow: '0 2px 4px rgba(0,0,0,0.85)' }}
                >
                  spiele
                </span>
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#e11d48] mx-0.5 shadow-[0_0_8px_rgba(225,29,72,0.75)] translate-y-[-2px]" />
                <span
                  className="text-lg sm:text-xl font-black italic tracking-tight text-[#cbd5e1]"
                  style={{ textShadow: '0 2px 4px rgba(0,0,0,0.85)' }}
                >
                  com
                </span>
              </div>

              <div className="flex flex-col gap-0.5 flex-1">
                <div className="h-[1.5px] w-full bg-gradient-to-l from-transparent via-[#be123c] to-[#be123c]" />
                <div className="h-[1px] w-3/4 bg-gradient-to-l from-transparent to-[#64748b]/60" />
              </div>
            </div>

            {/* Chamfered Inner Metallic-Graphite Frame Surrounding the Reflective STN LCD */}
            <div
              className="rounded-[10px] p-2.5 border border-[#2c303c]"
              style={{
                background: 'linear-gradient(145deg, #0d0f13 0%, #171a21 100%)',
                boxShadow: 'inset 0 3px 8px rgba(0, 0, 0, 0.95)'
              }}
            >
              <LCDScreen system={system} scale={effectiveScale} onFpsUpdate={onFpsUpdate} />
            </div>

            {/* Bottom Inner Bezel Silk-Screened Legend */}
            <div className="mt-2.5 flex items-center justify-between px-2 text-[8px] font-mono tracking-[0.2em] text-[#94a3b8] uppercase">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#a3ae76]" />
                TOUCH SCREEN
              </span>
              <span className="text-[#cbd5e1]/75 font-bold">
                DOT MATRIX
              </span>
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* RIGHT WING: DIAMOND A/B/C/D CLUSTER & DOCKED TIGER STYLUS       */}
          {/* --------------------------------------------------------------- */}
          <div className="flex flex-row lg:flex-col items-center justify-center w-full lg:w-44 gap-6 py-1">
            {/* Authentic 1997 Tiger Game.Com 4-Button Diamond Cluster (A, B, C, D) */}
            <div
              onContextMenu={(e) => e.preventDefault()}
              className="relative w-40 h-40 rounded-full p-3 border border-[#14161b] flex items-center justify-center touch-none"
              style={{
                background: 'radial-gradient(circle, #181a21 0%, #22252e 100%)',
                boxShadow:
                  'inset 0 4px 10px rgba(0, 0, 0, 0.85), 0 1px 1px rgba(255, 255, 255, 0.08)'
              }}
            >
              {/* BUTTON C (Top — Deep Slate-Violet) */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 flex flex-col items-center">
                <span className="text-[9px] font-black text-[#cbd5e1] tracking-wider mb-0.5">
                  C
                </span>
                <button
                  onPointerDown={() => handleBtnPress('c')}
                  onPointerUp={() => handleBtnRelease('c')}
                  onPointerLeave={() => pressedButtons.c && handleBtnRelease('c')}
                  className={`w-11 h-11 rounded-full font-black text-xs text-white border border-[#111318] transition-transform ${
                    pressedButtons.c
                      ? 'translate-y-0.5 scale-95 bg-[#3b3054] shadow-inner'
                      : 'bg-gradient-to-b from-[#524373] to-[#34294a] shadow-[0_4px_6px_rgba(0,0,0,0.8),inset_0_1px_2px_rgba(255,255,255,0.28)]'
                  }`}
                  title="Button C (Key C)"
                >
                  C
                </button>
              </div>

              {/* BUTTON D (Right — Deep Slate-Violet) */}
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                <button
                  onPointerDown={() => handleBtnPress('d')}
                  onPointerUp={() => handleBtnRelease('d')}
                  onPointerLeave={() => pressedButtons.d && handleBtnRelease('d')}
                  className={`w-11 h-11 rounded-full font-black text-xs text-white border border-[#111318] transition-transform ${
                    pressedButtons.d
                      ? 'translate-y-0.5 scale-95 bg-[#3b3054] shadow-inner'
                      : 'bg-gradient-to-b from-[#524373] to-[#34294a] shadow-[0_4px_6px_rgba(0,0,0,0.8),inset_0_1px_2px_rgba(255,255,255,0.28)]'
                  }`}
                  title="Button D (Key V)"
                >
                  D
                </button>
              </div>

              {/* BUTTON A (Left — Signature 1997 Tiger Burgundy-Plum Primary Action Button) */}
              <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center">
                <button
                  onPointerDown={() => handleBtnPress('a')}
                  onPointerUp={() => handleBtnRelease('a')}
                  onPointerLeave={() => pressedButtons.a && handleBtnRelease('a')}
                  className={`w-12 h-12 rounded-full font-black text-sm text-white border border-[#2a081d] transition-transform ${
                    pressedButtons.a
                      ? 'translate-y-0.5 scale-95 bg-[#591643] shadow-inner'
                      : 'bg-gradient-to-b from-[#832565] via-[#681b4f] to-[#471136] shadow-[0_4px_7px_rgba(0,0,0,0.85),inset_0_1px_2px_rgba(255,255,255,0.32)]'
                  }`}
                  title="Button A (Key Z / Enter)"
                >
                  A
                </button>
              </div>

              {/* BUTTON B (Bottom — Signature 1997 Tiger Burgundy-Plum Secondary Action Button) */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex flex-col items-center">
                <button
                  onPointerDown={() => handleBtnPress('b')}
                  onPointerUp={() => handleBtnRelease('b')}
                  onPointerLeave={() => pressedButtons.b && handleBtnRelease('b')}
                  className={`w-12 h-12 rounded-full font-black text-sm text-white border border-[#2a081d] transition-transform ${
                    pressedButtons.b
                      ? 'translate-y-0.5 scale-95 bg-[#591643] shadow-inner'
                      : 'bg-gradient-to-b from-[#832565] via-[#681b4f] to-[#471136] shadow-[0_4px_7px_rgba(0,0,0,0.85),inset_0_1px_2px_rgba(255,255,255,0.32)]'
                  }`}
                  title="Button B (Key X / Shift)"
                >
                  B
                </button>
              </div>
            </div>

            {/* Holstered Crimson-Tip Stylus */}
            <div className="hidden lg:flex items-center justify-center w-full px-2 pt-1">
              <div
                onClick={() => {
                  system.settings.stylusCursor = !system.settings.stylusCursor;
                  onStateChange?.();
                }}
                title="Toggle Stylus Cursor"
                className="cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#14161b] border border-[#2c303c] hover:border-[#be123c]"
              >
                <div className="w-2 h-4 rounded-full bg-gradient-to-b from-[#e11d48] to-[#4c0519]" />
                <span className="text-[8px] font-mono uppercase tracking-wider text-[#9ca3af]">
                  STYLUS
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
