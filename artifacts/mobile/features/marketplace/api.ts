// Marketplace endpoints (listings, favorites, cart, orders, reviews, moderation).
import { request } from "@/services/api/client";

export const marketplace = {
  // ── Products ──────────────────────────────────────────────────────────────
  products: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params ?? {});
    return request<{ data: unknown[]; pagination: unknown }>(`/products?${qs}`);
  },
  featured: () => request<{ data: unknown[] }>("/products/featured"),
  pending: () =>
    request<{ data: unknown[]; pagination: unknown }>("/products/pending"),
  myFavorites: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params ?? {});
    return request<{ data: unknown[]; pagination: unknown }>(
      `/products/my-favorites?${qs}`,
    );
  },
  myListings: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params ?? {});
    return request<{ data: unknown[]; pagination: unknown }>(
      `/products/my-listings?${qs}`,
    );
  },
  productDetail: (id: string) => request<{ data: unknown }>(`/products/${id}`),
  addProduct: (data: unknown) =>
    request<{ data: unknown; message: string }>("/products", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateProduct: (id: string, data: unknown) =>
    request<{ data: unknown; message: string }>(`/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteProduct: (id: string) =>
    request<{ message: string }>(`/products/${id}`, { method: "DELETE" }),

  // ── Moderation ────────────────────────────────────────────────────────────
  moderate: (
    id: string,
    payload: {
      action: string;
      reason?: string;
      note?: string;
      boostType?: string;
      boostDays?: number;
    },
  ) =>
    request<{ data: unknown; message: string }>(`/products/${id}/moderate`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ── Favorites ─────────────────────────────────────────────────────────────
  toggleFavorite: (id: string) =>
    request<{ isFavorited: boolean; message: string }>(
      `/products/${id}/favorite`,
      { method: "POST" },
    ),

  // ── Comments ──────────────────────────────────────────────────────────────
  comments: (productId: string, params?: Record<string, string>) => {
    const qs = new URLSearchParams(params ?? {});
    return request<{ data: unknown[]; pagination: unknown }>(
      `/products/${productId}/comments?${qs}`,
    );
  },
  addComment: (productId: string, content: string) =>
    request<{ data: unknown }>(`/products/${productId}/comments`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  deleteComment: (productId: string, commentId: string) =>
    request<{ message: string }>(
      `/products/${productId}/comments/${commentId}`,
      { method: "DELETE" },
    ),

  // ── Reports ───────────────────────────────────────────────────────────────
  reportProduct: (id: string, payload: { reason: string; details?: string }) =>
    request<{ data: unknown; message: string }>(`/products/${id}/report`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ── Premium promotion ─────────────────────────────────────────────────────
  promote: (
    id: string,
    payload: { type: string; durationDays: number; amount?: number },
  ) =>
    request<{ data: unknown; message: string }>(`/products/${id}/promote`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ── Sponsored-listing purchase flow (seller submits proof, admin validates) ─
  requestPromotion: (
    id: string,
    payload: {
      type: string;
      durationDays: number;
      paymentMethod: string;
      proofUrl?: string;
    },
  ) =>
    request<{ data: unknown; message: string }>(
      `/products/${id}/promotions/request`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  myPromotions: () => request<{ data: any[] }>("/products/my-promotions"),
  pendingPromotions: () =>
    request<{ data: any[] }>("/products/promotions/pending"),
  validatePromotion: (
    id: string,
    payload: { approve: boolean; rejectionReason?: string },
  ) =>
    request<{ data: unknown; message: string }>(
      `/products/promotions/${id}/validate`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      },
    ),

  // ── Reservation ───────────────────────────────────────────────────────────
  reserveProduct: (id: string) =>
    request<{ data: unknown; message: string }>(`/products/${id}/reserve`, {
      method: "POST",
    }),
  unreserveProduct: (id: string) =>
    request<{ data: unknown; message: string }>(`/products/${id}/reserve`, {
      method: "DELETE",
    }),

  // ── Mark sold ─────────────────────────────────────────────────────────────
  markSold: (id: string) =>
    request<{ data: unknown; message: string }>(`/products/${id}/mark-sold`, {
      method: "POST",
    }),

  // ── Seller reputation ─────────────────────────────────────────────────────
  sellerReputation: (sellerId: string) =>
    request<{ data: unknown }>(`/sellers/${sellerId}/reputation`),

  // ── Admin stats ───────────────────────────────────────────────────────────
  stats: () => request<{ data: unknown }>("/stats"),

  // ── Reported products (admin) ─────────────────────────────────────────────
  reported: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params ?? {});
    return request<{ data: unknown[]; pagination: unknown }>(
      `/products/reported?${qs}`,
    );
  },

  // ── Per-product reports detail (admin) ────────────────────────────────────
  productReports: (productId: string) =>
    request<{ data: unknown[] }>(`/products/${productId}/reports`),

  // ── Products filtered by status (admin) ───────────────────────────────────
  productsByStatus: (status: string, params?: Record<string, string>) => {
    const qs = new URLSearchParams({ status, ...(params ?? {}) });
    return request<{ data: unknown[]; pagination: unknown }>(`/products?${qs}`);
  },

  // ── Cart ──────────────────────────────────────────────────────────────────
  cart: () => request<{ data: unknown[] }>("/cart"),
  addToCart: (productId: string, quantity = 1) =>
    request<{ data: unknown; message: string }>("/cart", {
      method: "POST",
      body: JSON.stringify({ productId, quantity }),
    }),
  updateCartItem: (id: string, quantity: number) =>
    request<{ data: unknown }>(`/cart/${id}`, {
      method: "PUT",
      body: JSON.stringify({ quantity }),
    }),
  removeFromCart: (id: string) =>
    request<{ message: string }>(`/cart/${id}`, { method: "DELETE" }),
  clearCart: () => request<{ message: string }>("/cart", { method: "DELETE" }),

  // ── Orders ────────────────────────────────────────────────────────────────
  orders: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params ?? {});
    return request<{ data: unknown[]; pagination: unknown }>(`/orders?${qs}`);
  },
  placeOrder: (cartItemIds: string[]) =>
    request<{ data: unknown; message: string }>("/orders", {
      method: "POST",
      body: JSON.stringify({ cartItemIds }),
    }),
  updateOrderStatus: (id: string, status: string) =>
    request<{ data: unknown; message: string }>(`/orders/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),

  // ── Reviews ───────────────────────────────────────────────────────────────
  reviews: (productId?: string) => {
    const qs = productId ? `?productId=${productId}` : "";
    return request<{ data: unknown[] }>(`/reviews${qs}`);
  },
  addReview: (data: unknown) =>
    request<{ data: unknown }>("/reviews", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
