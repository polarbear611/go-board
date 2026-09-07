// 面板图标。统一用 currentColor 描边的线性图标，替掉原来的 emoji ——
// emoji 在不同系统/字体下渲染差异很大，与暖纸衬线的整体调性也不搭。
//
// 约定：24 视框、1.7 描边、圆角端点；尺寸由外部 size 控制，颜色随 currentColor。

function Svg({ size = 18, children, ...rest }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

/* ── 棋子：用真的圆来画，比 ⚫⚪ 更像棋子，也能跟着按钮变色 ── */

export function IconStoneBlack({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8" fill="currentColor" />
    </svg>
  )
}

export function IconStoneWhite({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8" fill="#fff" stroke="currentColor" strokeWidth={1.7} />
    </svg>
  )
}

/** 擦除：橡皮 */
export function IconErase({ size = 18 }) {
  return (
    <Svg size={size}>
      <path d="M8.5 19.5 4.6 15.6a1.8 1.8 0 0 1 0-2.5l8-8a1.8 1.8 0 0 1 2.5 0l3.9 3.9a1.8 1.8 0 0 1 0 2.5l-7 7Z" />
      <path d="M8.5 19.5H19" />
      <path d="m10.5 8.5 5 5" />
    </Svg>
  )
}

/* ── 操作 ── */

export function IconUndo({ size = 18 }) {
  return (
    <Svg size={size}>
      <path d="M4 8h9a5 5 0 0 1 0 10h-3" />
      <path d="m8 4-4 4 4 4" />
    </Svg>
  )
}

export function IconRedo({ size = 18 }) {
  return (
    <Svg size={size}>
      <path d="M20 8h-9a5 5 0 0 0 0 10h3" />
      <path d="m16 4 4 4-4 4" />
    </Svg>
  )
}

/** 清空：垃圾桶 */
export function IconClear({ size = 18 }) {
  return (
    <Svg size={size}>
      <path d="M4 7h16" />
      <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M6.5 7l.8 11.2A1.8 1.8 0 0 0 9.1 20h5.8a1.8 1.8 0 0 0 1.8-1.8L17.5 7" />
      <path d="M10.5 11v5M13.5 11v5" />
    </Svg>
  )
}

/* ── 题目 ── */

/** 保存：向下入盘 */
export function IconSave({ size = 18 }) {
  return (
    <Svg size={size}>
      <path d="M12 4v9" />
      <path d="m8.5 9.5 3.5 3.5 3.5-3.5" />
      <path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
    </Svg>
  )
}

/** 加载：打开的文件夹 */
export function IconLoad({ size = 18 }) {
  return (
    <Svg size={size}>
      <path d="M4 8.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9.5a1.5 1.5 0 0 0-1.5-1.5H12l-1.7-2.2A1.5 1.5 0 0 0 9.1 5H5.5A1.5 1.5 0 0 0 4 6.5v2Z" />
    </Svg>
  )
}

/** 导入：相机 */
export function IconCamera({ size = 18 }) {
  return (
    <Svg size={size}>
      <path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2.2l1.1-1.8A1.5 1.5 0 0 1 9.6 4.5h4.8a1.5 1.5 0 0 1 1.3.7L16.8 7H19a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V8.5Z" />
      <circle cx="12" cy="13" r="3.2" />
    </Svg>
  )
}

/** 还原题目 */
export function IconRestore({ size = 18 }) {
  return (
    <Svg size={size}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4 4v4h4" />
    </Svg>
  )
}

/** 视野锁定 */
export function IconLock({ size = 18 }) {
  return (
    <Svg size={size}>
      <rect x="4.8" y="10.5" width="14.4" height="9" rx="2" />
      <path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7" />
    </Svg>
  )
}

/* ── 音效开关 ── */

export function IconSoundOn({ size = 18 }) {
  return (
    <Svg size={size}>
      <path d="M11 5.5 6.5 9.2H3.5v5.6h3L11 18.5z" />
      <path d="M14.8 9.4a3.6 3.6 0 0 1 0 5.2" />
      <path d="M17.4 6.8a7.2 7.2 0 0 1 0 10.4" />
    </Svg>
  )
}

export function IconSoundOff({ size = 18 }) {
  return (
    <Svg size={size}>
      <path d="M11 5.5 6.5 9.2H3.5v5.6h3L11 18.5z" />
      <path d="m15.2 10 4.6 4.6M19.8 10l-4.6 4.6" />
    </Svg>
  )
}
