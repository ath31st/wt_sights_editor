import { isCountryBadge, vehicleTitle, type VehicleBadge } from "@wt_sights_editor/core";

function Star({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const inner = r * 0.42;
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? r : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`;
  });
  return <polygon points={points.join(" ")} fill="currentColor" />;
}

function BadgeIcon({ badge }: { badge: VehicleBadge }) {
  switch (badge) {
    case "il":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinejoin="round"
            d="M8 1.5 13.7 11.4H2.3Z"
          />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinejoin="round"
            d="M8 14.5 2.3 4.6h11.4Z"
          />
        </svg>
      );
    case "cn":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <Star cx={5.2} cy={8} r={4.2} />
          <Star cx={11.4} cy={3.3} r={1.35} />
          <Star cx={13.2} cy={6.2} r={1.15} />
          <Star cx={12.4} cy={9.4} r={1.15} />
          <Star cx={10.2} cy={11.8} r={1.15} />
        </svg>
      );
    case "germ":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M6.2 1h3.6v3.4H15v3.6h-5.2V15H6.2V7.99H1V4.4h5.2Z"
          />
        </svg>
      );
    case "ussr":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <Star cx={8} cy={8.2} r={6.4} />
        </svg>
      );
    case "us":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <g color="#111">
            <Star cx={8} cy={8} r={4.2} />
          </g>
        </svg>
      );
    case "uk":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="2.2" />
          <circle cx="8" cy="8" r="2.1" fill="currentColor" />
        </svg>
      );
    case "jp":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path fill="currentColor" d="M1.2 12.4a6.8 6.8 0 0 1 13.6 0Z" />
          <path
            fill="currentColor"
            d="M8 1.4 8.8 4.6 11.6 2.8 10 5.6 13.2 6.2 10.2 7.6 12.2 10.2 8.8 8.6 8 11.4 7.2 8.6 3.8 10.2 5.8 7.6 2.8 6.2 6 5.6 4.4 2.8 7.2 4.6Z"
          />
        </svg>
      );
    case "cross":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            fill="currentColor"
            fillRule="evenodd"
            d="M1.2 1.2h13.6v13.6H1.2Z M6.3 3.2h3.4v3.1h3.1v3.4H9.7v3.1H6.3V9.7H3.2V6.3h3.1Z"
          />
        </svg>
      );
    case "chevron":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path fill="currentColor" d="M2 3.2 10.2 8 2 12.8V9.6L5.4 8 2 6.4Z M4.6 3.2 12.8 8 4.6 12.8V9.6L8 8 4.6 6.4Z" />
        </svg>
      );
    case "diamond":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M8 1.2 14.6 8 8 14.8 1.4 8Z M5.2 4.6 3.6 8l1.6 3.4V4.6Z M10.8 4.6v6.8L12.4 8Z M7.1 3.8v8.4h1.8V3.8Z"
          />
        </svg>
      );
    case "squadron":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M4.2 9.2a3 3 0 0 1 .2-5.2 3.6 3.6 0 0 1 6.6-1.2A2.8 2.8 0 0 1 14 6.6a2.6 2.6 0 0 1-1.2 4.8H4.6a2.4 2.4 0 0 1-.4-2.2Z M7.2 8.2 5 15h2.1l1.1-3.6L9.4 15H11.6L8.6 8.2Z"
          />
        </svg>
      );
    case "trophy":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M4 1.5h8v2.2a4 4 0 0 1-2.6 3.7V9.2h2.2v1.6H4.4V9.2H6.6V7.4A4 4 0 0 1 4 3.7Z M2 2.2h2.2v2.4A3.2 3.2 0 0 1 2 2.2Z M11.8 2.2H14v2.4a3.2 3.2 0 0 1-2.2-2.4Z M5.2 12h5.6v1.6H5.2Z"
          />
        </svg>
      );
    case "paw":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="4.2" cy="5.2" r="1.5" fill="currentColor" />
          <circle cx="8" cy="3.6" r="1.5" fill="currentColor" />
          <circle cx="11.8" cy="5.2" r="1.5" fill="currentColor" />
          <ellipse cx="8" cy="10.4" rx="3.3" ry="2.6" fill="currentColor" />
        </svg>
      );
    case "skull":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M8 1.4a5.2 5.2 0 0 0-3.2 9.2v2.2h2.1v1.2h2.2v-1.2h2.1v-2.2A5.2 5.2 0 0 0 8 1.4Z M5.6 7.2a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Z M10.4 7.2a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Z"
          />
        </svg>
      );
    case "burst":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M8 1.2 9.2 6 14 4.6 10.4 8 14 11.4 9.2 10 8 14.8 6.8 10 2 11.4 5.6 8 2 4.6 6.8 6Z"
          />
        </svg>
      );
  }
}

export function VehicleName({
  name,
  countryLabel,
}: {
  name: string;
  countryLabel?: (code: string) => string;
}) {
  const { badge, text } = vehicleTitle(name);
  const title = badge && isCountryBadge(badge) ? countryLabel?.(badge) : undefined;
  return (
    <span className="vehicle-name">
      {badge ? (
        <span className="nation-mark" title={title}>
          <BadgeIcon badge={badge} />
        </span>
      ) : null}
      <span>{text}</span>
    </span>
  );
}
