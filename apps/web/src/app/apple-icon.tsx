import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon for iOS, which doesn't use SVG favicons. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#060912" }}>
        <svg viewBox="0 0 32 32" width="180" height="180" fill="none">
          <circle cx="10" cy="16" r="3.4" fill="#7cf3e0" />
          <path d="M15.6 9.2a9.6 9.6 0 0 1 0 13.6" stroke="#7cf3e0" strokeWidth="2.4" strokeLinecap="round" />
          <path
            d="M20.6 5.2a15.2 15.2 0 0 1 0 21.6"
            stroke="#7cf3e0"
            strokeOpacity="0.45"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    size,
  );
}
