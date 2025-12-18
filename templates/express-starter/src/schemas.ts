/**
 * Zod Schemas for the API
 *
 * These schemas define request/response types and are used for:
 * - Runtime validation
 * - TypeScript type inference
 * - Contract IR generation (via generate-contract.ts)
 */

import { z } from 'zod';

// ============================================================================
// Common Schemas
// ============================================================================

/**
 * Pagination query parameters
 */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/**
 * Paginated response wrapper
 */
export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    pagination: z.object({
      page: z.number().int(),
      limit: z.number().int(),
      total: z.number().int(),
      totalPages: z.number().int(),
    }),
  });

/**
 * Error response (used for 4xx/5xx responses)
 */
export const ErrorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z
    .array(
      z.object({
        field: z.string(),
        message: z.string(),
      })
    )
    .optional(),
  requestId: z.string().optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// ============================================================================
// Product Schemas
// ============================================================================

export const ProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  price: z.number().positive(),
  currency: z.string().length(3).default('USD'),
  category: z.enum(['electronics', 'clothing', 'food', 'books', 'other']),
  inStock: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Product = z.infer<typeof ProductSchema>;

export const CreateProductRequestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  price: z.number().positive(),
  currency: z.string().length(3).default('USD'),
  category: z.enum(['electronics', 'clothing', 'food', 'books', 'other']),
  inStock: z.boolean().default(true),
});
export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>;

export const UpdateProductRequestSchema = CreateProductRequestSchema.partial();
export type UpdateProductRequest = z.infer<typeof UpdateProductRequestSchema>;

export const ProductListResponseSchema = PaginatedResponseSchema(ProductSchema);
export type ProductListResponse = z.infer<typeof ProductListResponseSchema>;

export const ProductQuerySchema = PaginationQuerySchema.extend({
  category: z.enum(['electronics', 'clothing', 'food', 'books', 'other']).optional(),
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  inStock: z.coerce.boolean().optional(),
});
export type ProductQuery = z.infer<typeof ProductQuerySchema>;

// ============================================================================
// Order Schemas
// ============================================================================

export const OrderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
});
export type OrderItem = z.infer<typeof OrderItemSchema>;

export const OrderStatusSchema = z.enum([
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  items: z.array(OrderItemSchema).min(1),
  status: OrderStatusSchema,
  totalAmount: z.number().positive(),
  currency: z.string().length(3),
  shippingAddress: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string().optional(),
    postalCode: z.string(),
    country: z.string().length(2),
  }),
  notes: z.string().max(500).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Order = z.infer<typeof OrderSchema>;

export const CreateOrderRequestSchema = z.object({
  customerId: z.string().uuid(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
  shippingAddress: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string().optional(),
    postalCode: z.string(),
    country: z.string().length(2),
  }),
  notes: z.string().max(500).optional(),
});
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

export const UpdateOrderStatusRequestSchema = z.object({
  status: OrderStatusSchema,
  notes: z.string().max(500).optional(),
});
export type UpdateOrderStatusRequest = z.infer<typeof UpdateOrderStatusRequestSchema>;

export const OrderListResponseSchema = PaginatedResponseSchema(OrderSchema);
export type OrderListResponse = z.infer<typeof OrderListResponseSchema>;

export const OrderQuerySchema = PaginationQuerySchema.extend({
  customerId: z.string().uuid().optional(),
  status: OrderStatusSchema.optional(),
});
export type OrderQuery = z.infer<typeof OrderQuerySchema>;

// ============================================================================
// Health Check
// ============================================================================

export const HealthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  version: z.string(),
  timestamp: z.string().datetime(),
  checks: z
    .array(
      z.object({
        name: z.string(),
        status: z.enum(['pass', 'fail']),
        message: z.string().optional(),
      })
    )
    .optional(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
