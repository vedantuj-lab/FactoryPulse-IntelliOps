import React, { useState } from 'react';

export const FactoryPulseLogo: React.FC<{ size?: 'sm' | 'md' | 'lg'; showWordmark?: boolean }> = ({
  size = 'md',
  showWordmark = true,
}) => {
  const iconDim = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8';
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-xl' : 'text-lg';

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <svg
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${iconDim} shrink-0`}
        aria-hidden="true"
      >
        <rect x="2" y="2" width="36" height="36" rx="8" fill="#242A33" stroke="#FF8A32" strokeWidth="2" />
        <path
          d="M9 23H14.5L17.5 14L22 27L25.5 19H31"
          stroke="#FF8A32"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9" cy="23" r="2" fill="#19C6B4" />
        <circle cx="31" cy="19" r="2" fill="#19C6B4" />
      </svg>
      {showWordmark && (
        <span className={`${textSize} font-bold tracking-tight text-[#F5F6F8]`}>
          FactoryPulse <span className="text-[#FF8A32] font-semibold">IntelliOps</span>
        </span>
      )}
    </span>
  );
};

export const ResilientImage: React.FC<{
  src: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}> = ({ src, alt, className = '', fallbackLabel }) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`bg-gradient-to-br from-[#242A33] to-[#171A21] border border-neutral-800 flex flex-col items-center justify-center p-6 text-center ${className}`}
      >
        <FactoryPulseLogo size="sm" showWordmark={false} />
        <span className="text-xs text-neutral-400 mt-2">{fallbackLabel || alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
