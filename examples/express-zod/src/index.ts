/**
 * Example Express + Zod Application
 *
 * This is a placeholder example demonstrating how an Express app with Zod
 * schemas might be structured. In Week 2+, the contract extraction logic
 * will analyze this pattern to generate Contract IR.
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';

const app: Express = express();
app.use(express.json());

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Order item schema
 */
export const OrderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
});

/**
 * Create order request schema
 */
export const CreateOrderRequestSchema = z.object({
  customerId: z.string().min(1),
  items: z.array(OrderItemSchema).min(1),
  notes: z.string().optional(),
});

/**
 * Create order response schema
 */
export const CreateOrderResponseSchema = z.object({
  orderId: z.string(),
  status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']),
  createdAt: z.string().datetime(),
  estimatedDelivery: z.string().datetime().optional(),
});

/**
 * Error response schema
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

// Type aliases
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;
export type CreateOrderResponse = z.infer<typeof CreateOrderResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// ============================================================================
// Middleware
// ============================================================================

/**
 * Validation middleware factory
 */
function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errorResponse: ErrorResponse = {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: result.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      };
      res.status(400).json(errorResponse);
      return;
    }
    req.body = result.data;
    next();
  };
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /orders - Create a new order
 *
 * @description Creates a new order for the specified customer
 * @tags orders
 */
app.post('/orders', validateBody(CreateOrderRequestSchema), (req: Request, res: Response) => {
  const body = req.body as CreateOrderRequest;

  // Placeholder implementation
  const response: CreateOrderResponse = {
    orderId: `order-${Date.now()}`,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  res.status(201).json(response);

  // Log for debugging (would be removed in production)
  // eslint-disable-next-line no-console
  console.log('Order created:', { customerId: body.customerId, orderId: response.orderId });
});

// ============================================================================
// Server
// ============================================================================

const PORT = process.env.PORT || 3000;

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on port ${PORT}`);
  });
}

export { app };
