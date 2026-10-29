/**
 * 全局对话框/轻提示的模块级状态。
 *
 * 系统 `Alert.alert` 用的是原生主题，跟 App 的六套主题壳色不搭，所以统一换成
 * 自建弹窗。这里刻意沿用 Alert 的调用形状（title / message / buttons[].style），
 * 迁移时只需替换函数名，不改控制流。
 *
 * 单弹窗模型：同一时刻只显示一个对话框，新的请求排在其后执行——弹窗之间通常
 * 是「确认 → 失败提示」这种因果链，排队比互相覆盖更不容易丢信息。
 */
import { zh } from '@/i18n/zh';

export type DialogButtonStyle = 'default' | 'cancel' | 'destructive';

export type DialogButton = {
  text: string;
  style?: DialogButtonStyle;
  onPress?: () => void;
};

export type DialogOptions = {
  /** 点击遮罩/返回键是否可关闭，默认 true */
  cancelable?: boolean;
  /** 通过遮罩/返回键关闭时回调（按钮点击不走这里） */
  onDismiss?: () => void;
};

export type DialogRequest = {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
  cancelable: boolean;
  onDismiss?: () => void;
};

export type ToastRequest = { id: number; text: string };

export type DialogSnapshot = {
  dialog: DialogRequest | null;
  toast: ToastRequest | null;
};

type Listener = () => void;

let nextId = 1;
let current: DialogRequest | null = null;
const pending: DialogRequest[] = [];
let toast: ToastRequest | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let snapshot: DialogSnapshot = { dialog: null, toast: null };
const listeners = new Set<Listener>();

function publish() {
  snapshot = { dialog: current, toast };
  for (const listener of listeners) listener();
}

/** `useSyncExternalStore` 订阅入口；返回值在状态变更间保持引用稳定 */
export function subscribeDialog(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDialogSnapshot(): DialogSnapshot {
  return snapshot;
}

/**
 * 打开对话框。`buttons` 省略时只显示一个「知道了」按钮。
 * `style: 'cancel'` 不改变样式含义，仅用于标记遮罩关闭时的等价动作；
 * `style: 'destructive'` 用支出色渲染（删除类动作）。
 */
export function showDialog(
  title: string,
  message?: string,
  buttons?: DialogButton[],
  options?: DialogOptions,
): void {
  const request: DialogRequest = {
    id: nextId++,
    title,
    message,
    buttons: buttons?.length ? buttons : [{ text: zh.common.gotIt }],
    cancelable: options?.cancelable ?? true,
    onDismiss: options?.onDismiss,
  };
  if (current) pending.push(request);
  else current = request;
  publish();
}

/**
 * 关闭当前对话框并推进队列。
 * `buttonIndex` 为 null 表示遮罩/返回键关闭：只触发 onDismiss，不触发任何按钮。
 */
export function dismissDialog(buttonIndex: number | null): void {
  const request = current;
  if (!request) return;
  const button = buttonIndex === null ? undefined : request.buttons[buttonIndex];
  // 先出队再回调：回调里新开的对话框不会覆盖此刻正在展示的这一条。
  current = pending.shift() ?? null;
  publish();
  if (button) button.onPress?.();
  else request.onDismiss?.();
}

/** 轻提示：底部浮层，`durationMs` 后自动消失；新提示替换旧提示并重置计时 */
export function showToast(text: string, durationMs = 2000): void {
  if (toastTimer) clearTimeout(toastTimer);
  toast = { id: nextId++, text };
  publish();
  toastTimer = setTimeout(() => {
    toastTimer = null;
    toast = null;
    publish();
  }, durationMs);
}

/** 仅测试用：清空队列与计时器，避免用例之间互相污染 */
export function resetDialogStore(): void {
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = null;
  current = null;
  pending.length = 0;
  toast = null;
  publish();
}
