export type NotificationEvent = {
  message: string;
  type: "info" | "success" | "warning" | "error";
  icon?: string;
};

type Handler = (event: NotificationEvent) => void;
let _handler: Handler | null = null;

export const notificationBus = {
  emit: (event: NotificationEvent) => {
    _handler?.(event);
  },
  setHandler: (h: Handler | null) => {
    _handler = h;
  },
};
