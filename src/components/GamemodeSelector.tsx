import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { GamemodeSummary } from '../utils/categoryManagement';
import { useStoreConfig } from '../context/StoreConfigContext';
import type { GamemodeIconType } from '../types';
import { resolveGamemodeCardVisual } from '../utils/gamemodeVisualHelpers';
import lifestealBg from '../assets/images/lifesteal_bg_1794678969598.jpg';
import practiceBg from '../assets/images/practice_bg_1794678987213.jpg';

interface GamemodeSelectorProps {
  gamemodeSummaries: GamemodeSummary[];
  onSelectGamemode?: (gamemodeId: string) => void;
}

/* 3D Isometric Minecraft Cube Icon with Neon Diamond Hexagon */
const MinecraftCubeIcon: React.FC = () => (
  <div className="relative flex items-center justify-center">
    <svg
      viewBox="0 0 52 52"
      className="w-10 h-10 sm:w-12 sm:h-12 drop-shadow-[0_0_16px_rgba(192,132,252,0.9)]"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer Hexagon outline */}
      <polygon
        points="26,2 48,14 48,38 26,50 4,38 4,14"
        fill="#120422"
        stroke="#c084fc"
        strokeWidth="2.5"
      />
      {/* Hexagon Inner Accent Glow */}
      <polygon
        points="26,6 44,16 44,36 26,46 8,36 8,16"
        fill="#1c0734"
        stroke="#e879f9"
        strokeWidth="1"
        opacity="0.4"
      />
      {/* Inner Isometric Minecraft Cube - Top Face */}
      <polygon
        points="26,12 38,19 26,26 14,19"
        fill="#f3e8ff"
        stroke="#c084fc"
        strokeWidth="1.5"
      />
      {/* Left Face */}
      <polygon
        points="14,19 26,26 26,40 14,33"
        fill="#a855f7"
        stroke="#7e22ce"
        strokeWidth="1.5"
      />
      {/* Right Face */}
      <polygon
        points="26,26 38,19 38,33 26,40"
        fill="#7e22ce"
        stroke="#581c87"
        strokeWidth="1.5"
      />
      {/* Center inner bevel line */}
      <line x1="26" y1="26" x2="26" y2="40" stroke="#f3e8ff" strokeWidth="1.2" opacity="0.7" />
    </svg>
  </div>
);

interface CenterGraphicProps {
  iconType?: GamemodeIconType;
  iconValue?: string;
}

/* 3D Pixel Heart with Glowing Neon Orbit & Star Particles */
const AnimatedPixelHeart: React.FC<CenterGraphicProps> = ({
  iconType = 'default',
  iconValue = '',
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [iconType, iconValue]);

  const showCustomImage = iconType === 'image' && Boolean(iconValue) && !imgFailed;
  const showCustomEmoji = iconType === 'emoji' && Boolean(iconValue);

  return (
  <div
    data-testid="gamemode-icon-lifesteal"
    data-icon-type={showCustomImage ? 'image' : showCustomEmoji ? 'emoji' : 'default'}
    className="relative w-56 h-44 sm:w-64 sm:h-48 flex items-center justify-center"
  >
    {/* Background Soft Purple Glow */}
    <div className="absolute w-44 h-44 rounded-full bg-purple-600/35 blur-3xl pointer-events-none animate-pulse" />

    {/* Glowing Tilted Orbital Ring */}
    <svg
      viewBox="0 0 280 160"
      className="absolute inset-0 w-full h-full pointer-events-none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="heart-orbit-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" result="blur1" />
          <feGaussianBlur stdDeviation="3" result="blur2" />
          <feMerge>
            <feMergeNode in="blur1" />
            <feMergeNode in="blur2" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="heart-orbit-grad" x1="10" y1="20" x2="270" y2="140" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#c084fc" stopOpacity="0.25" />
          <stop offset="40%" stopColor="#f472b6" stopOpacity="0.95" />
          <stop offset="65%" stopColor="#d946ef" stopOpacity="1" />
          <stop offset="90%" stopColor="#a855f7" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.2" />
        </linearGradient>
      </defs>

      {/* Orbit Ellipse Outer Glow */}
      <ellipse
        cx="140"
        cy="80"
        rx="115"
        ry="34"
        transform="rotate(-16 140 80)"
        stroke="url(#heart-orbit-grad)"
        strokeWidth="6"
        filter="url(#heart-orbit-glow)"
        opacity="0.9"
        className="animate-pulse"
      />
      {/* Orbit Ellipse Crisp Core */}
      <ellipse
        cx="140"
        cy="80"
        rx="115"
        ry="34"
        transform="rotate(-16 140 80)"
        stroke="#ffffff"
        strokeWidth="2"
        opacity="0.85"
      />
    </svg>

    {/* Floating 3D Pixel Heart Graphic (or Admin Custom Icon) */}
    <div className="relative z-10 transition-transform duration-300 group-hover:scale-110 animate-icon-float flex items-center justify-center">
      {showCustomImage ? (
        <img
          src={iconValue}
          alt="Lifesteal custom icon"
          onError={() => setImgFailed(true)}
          className="w-24 h-24 sm:w-28 sm:h-28 object-contain drop-shadow-[0_14px_28px_rgba(239,68,68,0.65)] select-none"
        />
      ) : showCustomEmoji ? (
        <span
          aria-label="Lifesteal custom icon"
          className="text-7xl sm:text-8xl leading-none select-none drop-shadow-[0_12px_28px_rgba(239,68,68,0.75)]"
        >
          {iconValue}
        </span>
      ) : (
        <svg
          viewBox="0 0 64 64"
          className="w-24 h-24 sm:w-28 sm:h-28 drop-shadow-[0_16px_30px_rgba(239,68,68,0.65)]"
          shapeRendering="crispEdges"
          xmlns="http://www.w3.org/2000/svg"
        >
        {/* 3D Black / Deep Maroon Rear Extrusion (Depth) */}
        <g fill="#1a0207">
          <rect x="10" y="16" width="18" height="6" />
          <rect x="34" y="16" width="18" height="6" />
          <rect x="6" y="20" width="50" height="20" />
          <rect x="10" y="38" width="42" height="6" />
          <rect x="16" y="44" width="30" height="6" />
          <rect x="22" y="50" width="18" height="6" />
          <rect x="28" y="56" width="6" height="6" />
        </g>

        {/* 3D Black Border of Front Heart */}
        <g fill="#000000">
          <rect x="16" y="12" width="12" height="4" />
          <rect x="36" y="12" width="12" height="4" />
          <rect x="12" y="16" width="4" height="4" />
          <rect x="28" y="16" width="8" height="4" />
          <rect x="48" y="16" width="4" height="4" />
          <rect x="8" y="20" width="4" height="14" />
          <rect x="52" y="20" width="4" height="14" />
          <rect x="12" y="34" width="4" height="4" />
          <rect x="48" y="34" width="4" height="4" />
          <rect x="16" y="38" width="4" height="4" />
          <rect x="44" y="38" width="4" height="4" />
          <rect x="20" y="42" width="4" height="4" />
          <rect x="40" y="42" width="4" height="4" />
          <rect x="24" y="46" width="4" height="4" />
          <rect x="36" y="46" width="4" height="4" />
          <rect x="28" y="50" width="8" height="4" />
        </g>

        {/* Deep Ruby Shadow Pixels (Lower-Right & Bevel) */}
        <g fill="#88081c">
          <rect x="16" y="34" width="32" height="4" />
          <rect x="20" y="38" width="24" height="4" />
          <rect x="24" y="42" width="16" height="4" />
          <rect x="28" y="46" width="8" height="4" />
          <rect x="44" y="24" width="8" height="10" />
        </g>

        {/* Rich Scarlet Red Body */}
        <g fill="#e11d48">
          <rect x="16" y="16" width="12" height="8" />
          <rect x="36" y="16" width="12" height="8" />
          <rect x="12" y="20" width="40" height="14" />
          <rect x="16" y="30" width="32" height="4" />
          <rect x="20" y="34" width="16" height="4" />
        </g>

        {/* Vibrant Crimson Red Face */}
        <g fill="#f43f5e">
          <rect x="16" y="16" width="10" height="6" />
          <rect x="36" y="16" width="10" height="6" />
          <rect x="14" y="22" width="12" height="6" />
        </g>

        {/* Specular White Pixel Highlights */}
        <g fill="#ffffff">
          <rect x="18" y="18" width="4" height="4" />
          <rect x="14" y="22" width="4" height="4" />
        </g>
      </svg>
      )}
    </div>

    {/* Sparkle Stars Around Heart */}
    <span className="absolute top-3 right-6 text-purple-300 text-sm animate-sparkle">✦</span>
    <span className="absolute bottom-4 left-6 text-pink-300 text-base animate-[sparkle-pulse_2.8s_infinite]">★</span>
    <span className="absolute top-8 left-4 text-fuchsia-200 text-xs animate-[sparkle-pulse_2.2s_infinite]">✦</span>
    <span className="absolute bottom-8 right-8 text-violet-200 text-xs animate-[sparkle-pulse_3.2s_infinite]">✧</span>
  </div>
  );
};

/* Authentic Minecraft Diamond Sword with Glowing Neon Cyan Orbit */
const AnimatedPixelSword: React.FC<CenterGraphicProps> = ({
  iconType = 'default',
  iconValue = '',
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [iconType, iconValue]);

  const showCustomImage = iconType === 'image' && Boolean(iconValue) && !imgFailed;
  const showCustomEmoji = iconType === 'emoji' && Boolean(iconValue);

  return (
  <div
    data-testid="gamemode-icon-practice"
    data-icon-type={showCustomImage ? 'image' : showCustomEmoji ? 'emoji' : 'default'}
    className="relative w-56 h-44 sm:w-64 sm:h-48 flex items-center justify-center"
  >
    {/* Background Soft Blue Glow */}
    <div className="absolute w-44 h-44 rounded-full bg-cyan-500/35 blur-3xl pointer-events-none animate-pulse" />

    {/* Glowing Tilted Orbital Ring */}
    <svg
      viewBox="0 0 280 160"
      className="absolute inset-0 w-full h-full pointer-events-none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="sword-orbit-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" result="blur1" />
          <feGaussianBlur stdDeviation="3" result="blur2" />
          <feMerge>
            <feMergeNode in="blur1" />
            <feMergeNode in="blur2" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="sword-orbit-grad" x1="10" y1="20" x2="270" y2="140" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
          <stop offset="35%" stopColor="#67e8f9" stopOpacity="0.95" />
          <stop offset="65%" stopColor="#22d3ee" stopOpacity="1" />
          <stop offset="85%" stopColor="#0284c7" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#0369a1" stopOpacity="0.2" />
        </linearGradient>
      </defs>

      {/* Orbit Ellipse Outer Glow */}
      <ellipse
        cx="140"
        cy="80"
        rx="115"
        ry="34"
        transform="rotate(-16 140 80)"
        stroke="url(#sword-orbit-grad)"
        strokeWidth="6"
        filter="url(#sword-orbit-glow)"
        opacity="0.9"
        className="animate-pulse"
      />
      {/* Orbit Ellipse Crisp Core */}
      <ellipse
        cx="140"
        cy="80"
        rx="115"
        ry="34"
        transform="rotate(-16 140 80)"
        stroke="#ffffff"
        strokeWidth="2"
        opacity="0.85"
      />
    </svg>

    {/* Floating Minecraft Diamond Sword Graphic (or Admin Custom Icon) */}
    <div className="relative z-10 transition-transform duration-300 group-hover:scale-110 animate-icon-float flex items-center justify-center">
      {showCustomImage ? (
        <img
          src={iconValue}
          alt="Practice custom icon"
          onError={() => setImgFailed(true)}
          className="w-24 h-24 sm:w-28 sm:h-28 object-contain drop-shadow-[0_14px_28px_rgba(56,189,248,0.75)] select-none"
        />
      ) : showCustomEmoji ? (
        <span
          aria-label="Practice custom icon"
          className="text-7xl sm:text-8xl leading-none select-none drop-shadow-[0_12px_28px_rgba(56,189,248,0.75)]"
        >
          {iconValue}
        </span>
      ) : (
      <svg
        viewBox="0 0 64 64"
        className="w-24 h-24 sm:w-28 sm:h-28 drop-shadow-[0_16px_30px_rgba(56,189,248,0.7)]"
        shapeRendering="crispEdges"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Deep 3D Shadow Layer offset down-left */}
        <g fill="#011833" opacity="0.85">
          <rect x="46" y="2" width="16" height="12" />
          <rect x="38" y="10" width="16" height="12" />
          <rect x="30" y="18" width="16" height="12" />
          <rect x="22" y="26" width="16" height="12" />
          <rect x="6" y="26" width="22" height="14" />
          <rect x="22" y="42" width="18" height="14" />
          <rect x="14" y="42" width="12" height="14" />
          <rect x="6" y="50" width="10" height="10" />
        </g>

        {/* 1. Black Pixel Outline */}
        <g fill="#02162e">
          {/* Blade Tip Outline */}
          <rect x="48" y="0" width="8" height="4" />
          <rect x="44" y="4" width="4" height="4" />
          <rect x="56" y="4" width="8" height="4" />
          <rect x="40" y="8" width="4" height="4" />
          <rect x="60" y="8" width="4" height="4" />
          <rect x="36" y="12" width="4" height="4" />
          <rect x="56" y="12" width="8" height="4" />
          <rect x="32" y="16" width="4" height="4" />
          <rect x="52" y="16" width="8" height="4" />
          <rect x="28" y="20" width="4" height="4" />
          <rect x="48" y="20" width="8" height="4" />
          <rect x="24" y="24" width="4" height="4" />
          <rect x="44" y="24" width="8" height="4" />

          {/* Crossguard Top-Left Wing Outline */}
          <rect x="8" y="24" width="12" height="4" />
          <rect x="8" y="28" width="4" height="4" />
          <rect x="16" y="28" width="12" height="4" />
          <rect x="12" y="32" width="4" height="8" />
          <rect x="24" y="32" width="4" height="4" />
          <rect x="40" y="32" width="8" height="4" />

          {/* Crossguard Bottom-Right Wing Outline */}
          <rect x="20" y="36" width="4" height="4" />
          <rect x="36" y="36" width="4" height="4" />
          <rect x="16" y="40" width="4" height="4" />
          <rect x="32" y="40" width="12" height="4" />
          <rect x="40" y="44" width="4" height="8" />
          <rect x="28" y="48" width="12" height="4" />

          {/* Wooden Handle Outline */}
          <rect x="12" y="44" width="4" height="4" />
          <rect x="24" y="44" width="4" height="4" />
          <rect x="8" y="48" width="4" height="4" />
          <rect x="20" y="48" width="4" height="4" />

          {/* Pommel Outline */}
          <rect x="4" y="52" width="4" height="4" />
          <rect x="16" y="52" width="4" height="4" />
          <rect x="4" y="56" width="12" height="4" />
        </g>

        {/* 2. Deep Cyan Diamond Shading (Bottom-right edge of blade & guard) */}
        <g fill="#0284c7">
          <rect x="52" y="12" width="4" height="4" />
          <rect x="48" y="16" width="4" height="4" />
          <rect x="44" y="20" width="4" height="4" />
          <rect x="40" y="24" width="4" height="4" />
          <rect x="36" y="28" width="4" height="4" />
          <rect x="20" y="32" width="4" height="4" />
          <rect x="12" y="28" width="4" height="4" />
          <rect x="36" y="44" width="4" height="4" />
          <rect x="32" y="48" width="4" height="4" />
          <rect x="8" y="52" width="4" height="4" />
        </g>

        {/* 3. Mid Cyan Diamond Core */}
        <g fill="#22d3ee">
          <rect x="52" y="4" width="4" height="4" />
          <rect x="56" y="8" width="4" height="4" />
          <rect x="48" y="12" width="4" height="4" />
          <rect x="44" y="16" width="4" height="4" />
          <rect x="40" y="20" width="4" height="4" />
          <rect x="36" y="24" width="4" height="4" />
          <rect x="32" y="28" width="4" height="4" />
          <rect x="12" y="32" width="4" height="4" />
          <rect x="16" y="32" width="4" height="4" />
          <rect x="32" y="44" width="4" height="4" />
          <rect x="28" y="44" width="4" height="4" />
          <rect x="12" y="52" width="4" height="4" />
        </g>

        {/* 4. Bright Specular White Blade Highlights (Upper-left edge) */}
        <g fill="#ffffff">
          <rect x="48" y="4" width="4" height="4" />
          <rect x="48" y="8" width="8" height="4" />
          <rect x="44" y="12" width="4" height="4" />
          <rect x="40" y="16" width="4" height="4" />
          <rect x="36" y="20" width="4" height="4" />
          <rect x="32" y="24" width="4" height="4" />
          <rect x="28" y="28" width="4" height="4" />
          <rect x="16" y="36" width="4" height="4" />
          <rect x="28" y="40" width="4" height="4" />
        </g>

        {/* 5. Wooden Grip Handle */}
        <g fill="#855228">
          <rect x="20" y="40" width="4" height="4" />
          <rect x="16" y="44" width="4" height="4" />
        </g>
        <g fill="#4a2509">
          <rect x="16" y="48" width="4" height="4" />
          <rect x="12" y="48" width="4" height="4" />
        </g>
      </svg>
      )}
    </div>

    {/* Sparkle Stars Around Sword */}
    <span className="absolute top-3 left-6 text-cyan-200 text-sm animate-sparkle">✦</span>
    <span className="absolute bottom-4 right-6 text-sky-300 text-base animate-[sparkle-pulse_3s_infinite]">★</span>
    <span className="absolute top-8 right-4 text-blue-200 text-xs animate-[sparkle-pulse_2.5s_infinite]">✦</span>
    <span className="absolute bottom-8 left-8 text-teal-200 text-xs animate-[sparkle-pulse_3.4s_infinite]">✧</span>
  </div>
  );
};

export const GamemodeSelector: React.FC<GamemodeSelectorProps> = ({
  gamemodeSummaries,
  onSelectGamemode,
}) => {
  const { config } = useStoreConfig();

  return (
    <section aria-label="Select Server Gamemode" className="py-4 space-y-7 sm:space-y-8">
      {/* Header matching user's design image */}
      <div className="text-center space-y-2.5 max-w-2xl mx-auto px-2">
        {/* Isometric Cube with flanking divider lines */}
        <div className="flex items-center justify-center gap-3">
          <div className="h-px w-14 sm:w-28 bg-gradient-to-r from-transparent via-purple-500/60 to-purple-400" />
          <MinecraftCubeIcon />
          <div className="h-px w-14 sm:w-28 bg-gradient-to-l from-transparent via-purple-500/60 to-purple-400" />
        </div>

        {/* Big Retro Gaming Title */}
        <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-wider font-pixel text-transparent bg-clip-text bg-gradient-to-r from-purple-100 via-pink-100 to-cyan-200 drop-shadow-[0_4px_22px_rgba(168,85,247,0.6)]">
          SELECT GAMEMODE
        </h2>

        {/* Subtitle */}
        <p className="text-sm sm:text-base text-purple-200/90 font-sans font-medium tracking-wide">
          Choose between our gamemodes
        </p>
      </div>

      {/* Vertical Option Selector Stack (Per user's explicit instruction: vertical not horizontal) */}
      <div
        role="group"
        aria-label="Available server gamemodes"
        className="flex flex-col gap-6 sm:gap-7 max-w-xl mx-auto w-full px-2"
      >
        {gamemodeSummaries.map((mode) => {
          const isPractice = mode.id.toLowerCase() === 'practice';
          const isLifesteal = !isPractice;

          /* Card Theming matching the image */
          const cardBorder = isLifesteal
            ? 'border-2 border-purple-500/90 hover:border-purple-400 shadow-[0_0_35px_rgba(168,85,247,0.38),inset_0_0_24px_rgba(168,85,247,0.15)] hover:shadow-[0_0_60px_rgba(168,85,247,0.65),inset_0_0_36px_rgba(168,85,247,0.28)]'
            : 'border-2 border-sky-500/90 hover:border-sky-400 shadow-[0_0_35px_rgba(56,189,248,0.38),inset_0_0_24px_rgba(56,189,248,0.15)] hover:shadow-[0_0_60px_rgba(56,189,248,0.65),inset_0_0_36px_rgba(56,189,248,0.28)]';

          const cardBg = isLifesteal
            ? 'bg-gradient-to-b from-[#16062b]/95 via-[#0e031c]/95 to-[#06010d]/98'
            : 'bg-gradient-to-b from-[#051838]/95 via-[#030e24]/95 to-[#010614]/98';

          const buttonBg = isLifesteal
            ? 'bg-gradient-to-r from-[#7e22ce] via-[#9333ea] to-[#c026d3] border border-purple-300/40 shadow-[0_0_26px_rgba(168,85,247,0.7)] hover:shadow-[0_0_38px_rgba(168,85,247,1)]'
            : 'bg-gradient-to-r from-[#0284c7] via-[#0ea5e9] to-[#2563eb] border border-sky-300/40 shadow-[0_0_26px_rgba(56,189,248,0.7)] hover:shadow-[0_0_38px_rgba(56,189,248,1)]';

          const buttonLabel = `Select ${mode.label}`;
          const resolvedVisual = resolveGamemodeCardVisual(
            isLifesteal ? 'lifesteal' : 'practice',
            config,
            isLifesteal ? lifestealBg : practiceBg
          );
          const bgImageSrc = resolvedVisual.bgUrl;

          return (
            <div
              key={mode.id}
              onClick={() => onSelectGamemode?.(mode.id)}
              data-testid={`gamemode-card-${mode.id.toLowerCase()}`}
              className={`group relative rounded-[30px] sm:rounded-[38px] ${cardBorder} ${cardBg} backdrop-blur-xl p-6 sm:p-8 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1.5 cursor-pointer overflow-hidden`}
            >
              {/* Atmospheric Minecraft Landscape Background Image (per user request: "Background me image dal do like this image") */}
              <img
                src={bgImageSrc}
                alt={`${mode.label} background scenery`}
                className="absolute inset-0 w-full h-full object-cover object-center opacity-40 group-hover:opacity-55 scale-105 group-hover:scale-110 transition-all duration-700 pointer-events-none select-none"
              />

              {/* Cinematic Vignette & Ambient Top Glow Overlays */}
              <div
                className={`absolute inset-0 pointer-events-none ${
                  isLifesteal
                    ? 'bg-gradient-to-t from-[#0e021c] via-[#100322]/80 to-[#190533]/50'
                    : 'bg-gradient-to-t from-[#020d24] via-[#041538]/80 to-[#082255]/50'
                }`}
              />
              <div
                className={`absolute inset-0 pointer-events-none ${
                  isLifesteal
                    ? 'bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.25),transparent_70%)]'
                    : 'bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.25),transparent_70%)]'
                }`}
              />

              {/* Animated Graphic (3D Pixel Heart for Lifesteal, Diamond Sword for Practice — Admin Customizable) */}
              <div className="relative mb-2 z-10">
                {isLifesteal ? (
                  <AnimatedPixelHeart
                    iconType={resolvedVisual.iconType}
                    iconValue={resolvedVisual.iconValue}
                  />
                ) : (
                  <AnimatedPixelSword
                    iconType={resolvedVisual.iconType}
                    iconValue={resolvedVisual.iconValue}
                  />
                )}
              </div>

              {/* Gamemode Title (Bold Modern Geometric Sans, matching user's image) */}
              <h3 className="relative z-10 text-3xl sm:text-4xl font-black text-white font-sans tracking-[0.16em] uppercase mb-6 drop-shadow-[0_2px_14px_rgba(255,255,255,0.45)]">
                {mode.label}
              </h3>

              {/* Action Button: `→ Select Lifesteal` / `→ Select Practice` (No description text per user instructions) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectGamemode?.(mode.id);
                }}
                className={`relative z-10 w-full py-3.5 sm:py-4 px-6 rounded-full font-black text-sm sm:text-base tracking-wider text-white ${buttonBg} hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 cursor-pointer`}
              >
                <ArrowRight className="w-5 h-5 stroke-[2.8] text-white transition-transform duration-200 group-hover:translate-x-1" />
                <span>{buttonLabel}</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
};
