/** Phantom 지갑 연결 버튼 옆에 붙이는 작은 유령 아이콘 — 브랜드 로고 파일을 쓰지 않고
 *  단순한 실루엣으로 대체 (라이선스 걱정 없이 "이 버튼은 지갑 연결"임을 표시). */
export function PhantomIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ marginRight: 6, verticalAlign: -2 }}
    >
      <path
        d="M12 2C7.03 2 3 6.03 3 11v8.5c0 .3.15.58.4.74.25.16.56.18.83.05L6 19.2l1.77 1.1c.27.17.6.17.87 0L10.4 19.2l1.6 1.1c.27.17.6.17.87 0l1.77-1.1 1.77 1.1c.27.13.58.11.83-.05.25-.16.4-.44.4-.74V11c0-4.97-4.03-9-9-9z"
        fill="currentColor"
      />
      <circle cx="9" cy="11" r="1.3" fill="var(--void)" />
      <circle cx="15" cy="11" r="1.3" fill="var(--void)" />
    </svg>
  );
}
