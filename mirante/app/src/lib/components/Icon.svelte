<script lang="ts">
  // Ícones de traço arredondado, desenhados no mesmo estilo do logo.
  let { name, size = 19 }: { name: string; size?: number } = $props();
  const P: Record<string, string> = {
    home: "M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z",
    search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20",
    people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.5a3.2 3.2 0 0 1 0 6.3M18 14.6c2 .7 3.2 2.6 3.5 5.4",
    gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.6 1.2-1.8 3.1-1.9-.7a7 7 0 0 1-2 1.2L15 20.3h-3.6l-.3-2a7 7 0 0 1-2-1.2l-1.9.7-1.8-3.1 1.6-1.2a7 7 0 0 1 0-2.4L5.4 9.9l1.8-3.1 1.9.7a7 7 0 0 1 2-1.2l.3-2h3.6l.3 2a7 7 0 0 1 2 1.2l1.9-.7 1.8 3.1-1.6 1.2a7 7 0 0 1 0 2.4z",
    x: "M6 6l12 12M18 6 6 18",
    left: "M15 5l-7 7 7 7", right: "M9 5l7 7-7 7",
    up: "M6 15l6-6 6 6", down: "M6 9l6 6 6-6",
    bookmark: "M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z",
    eyeoff: "M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4.5 9.5 6-.5.8-1.6 2.3-3.2 3.6M6.5 7.6C4.6 8.9 3.2 10.8 2.5 12c1 1.5 4.5 6 9.5 6 1.5 0 2.9-.4 4.1-1M9.9 10a3 3 0 0 0 4.1 4.1",
    external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
    link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
    grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
    list: "M4 5h4v4H4zM11 6h9M11 8h6M4 15h4v4H4zM11 16h9M11 18h6",
    play: "M8 5v14l11-7z",
    heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
    chat: "M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
    eye: "M2.5 12C3.5 10.5 7 6 12 6s8.5 4.5 9.5 6c-1 1.5-4.5 6-9.5 6s-8.5-4.5-9.5-6zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    sync: "M20 11a8 8 0 0 0-14.3-4.3L4 9M4 4v5h5M4 13a8 8 0 0 0 14.3 4.3L20 15M20 20v-5h-5",
    check: "M5 12.5l4.5 4.5L19 7.5",
    plus: "M12 5v14M5 12h14",
    file: "M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5",
    filter: "M4 5h16l-6 7.5V19l-4 1.5v-8z",
    pause: "M8 5h3v14H8zM13 5h3v14h-3z",
    trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  };
</script>

<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
  <path d={P[name] || ""} />
</svg>
