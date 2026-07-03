import { Request } from "express";

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export function getPagination(req: Request, defaultLimit = 50): PaginationParams {
  const rawPage = parseInt(req.query.page as string, 10);
  const rawLimit = parseInt(req.query.limit as string, 10);
  const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const limit = Number.isNaN(rawLimit) || rawLimit < 1 ? defaultLimit : Math.min(rawLimit, 200);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function buildPagedResponse<T>(
  data: T[],
  total: number,
  { page, limit }: PaginationParams,
): PaginatedResponse<T> {
  return {
    data,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}
