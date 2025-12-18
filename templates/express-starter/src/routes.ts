/**
 * API Routes
 *
 * Defines all endpoints with Zod validation and operationId tagging.
 * The ACP middleware captures request/response pairs for contract verification.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import {
  ProductSchema,
  ProductListResponseSchema,
  CreateProductRequestSchema,
  UpdateProductRequestSchema,
  ProductQuerySchema,
  OrderSchema,
  OrderListResponseSchema,
  CreateOrderRequestSchema,
  UpdateOrderStatusRequestSchema,
  OrderQuerySchema,
  HealthResponseSchema,
  ErrorResponseSchema,
  type Product,
  type Order,
  type ErrorResponse,
} from './schemas.js';

const router = Router();

// ============================================================================
// In-memory data store (replace with real database)
// ============================================================================

const products: Map<string, Product> = new Map();
const orders: Map<string, Order> = new Map();

// Seed some initial data
const seedData = () => {
  const now = new Date().toISOString();

  const initialProducts: Product[] = [
    {
      id: randomUUID(),
      name: 'Wireless Headphones',
      description: 'High-quality wireless headphones with noise cancellation',
      price: 149.99,
      currency: 'USD',
      category: 'electronics',
      inStock: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      name: 'TypeScript Handbook',
      description: 'Complete guide to TypeScript programming',
      price: 39.99,
      currency: 'USD',
      category: 'books',
      inStock: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      name: 'Cotton T-Shirt',
      price: 24.99,
      currency: 'USD',
      category: 'clothing',
      inStock: false,
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const product of initialProducts) {
    products.set(product.id, product);
  }
};

seedData();

// ============================================================================
// Middleware
// ============================================================================

/**
 * Validation middleware factory for request body
 */
function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errorResponse: ErrorResponse = {
        code: 'VALIDATION_ERROR',
        message: 'Request body validation failed',
        details: result.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
        requestId: req.headers['x-request-id'] as string,
      };
      res.status(400).json(errorResponse);
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validation middleware factory for query parameters
 */
function validateQuery<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errorResponse: ErrorResponse = {
        code: 'VALIDATION_ERROR',
        message: 'Query parameter validation failed',
        details: result.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
        requestId: req.headers['x-request-id'] as string,
      };
      res.status(400).json(errorResponse);
      return;
    }
    (req as any).validatedQuery = result.data;
    next();
  };
}

// ============================================================================
// Health Check Endpoint
// ============================================================================

/**
 * GET /health
 * @operationId getHealth
 * @description Health check endpoint
 * @response 200 - Service is healthy
 */
router.get('/health', (req: Request, res: Response) => {
  const response = HealthResponseSchema.parse({
    status: 'healthy',
    version: process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString(),
    checks: [
      { name: 'database', status: 'pass' },
      { name: 'cache', status: 'pass' },
    ],
  });
  res.json(response);
});

// ============================================================================
// Product Endpoints
// ============================================================================

/**
 * GET /products
 * @operationId listProducts
 * @description List all products with optional filtering and pagination
 * @query page - Page number (default: 1)
 * @query limit - Items per page (default: 20, max: 100)
 * @query category - Filter by category
 * @query minPrice - Minimum price filter
 * @query maxPrice - Maximum price filter
 * @query inStock - Filter by stock availability
 * @response 200 - Paginated list of products
 */
router.get('/products', validateQuery(ProductQuerySchema), (req: Request, res: Response) => {
  const query = (req as any).validatedQuery;

  let filtered = Array.from(products.values());

  // Apply filters
  if (query.category) {
    filtered = filtered.filter((p) => p.category === query.category);
  }
  if (query.minPrice !== undefined) {
    filtered = filtered.filter((p) => p.price >= query.minPrice);
  }
  if (query.maxPrice !== undefined) {
    filtered = filtered.filter((p) => p.price <= query.maxPrice);
  }
  if (query.inStock !== undefined) {
    filtered = filtered.filter((p) => p.inStock === query.inStock);
  }

  // Pagination
  const total = filtered.length;
  const totalPages = Math.ceil(total / query.limit);
  const start = (query.page - 1) * query.limit;
  const items = filtered.slice(start, start + query.limit);

  const response = ProductListResponseSchema.parse({
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
    },
  });

  res.json(response);
});

/**
 * GET /products/:id
 * @operationId getProduct
 * @description Get a product by ID
 * @param id - Product ID (UUID)
 * @response 200 - Product details
 * @response 404 - Product not found
 */
router.get('/products/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const product = products.get(id);

  if (!product) {
    const errorResponse: ErrorResponse = {
      code: 'NOT_FOUND',
      message: `Product with ID ${id} not found`,
      requestId: req.headers['x-request-id'] as string,
    };
    res.status(404).json(errorResponse);
    return;
  }

  res.json(product);
});

/**
 * POST /products
 * @operationId createProduct
 * @description Create a new product
 * @body CreateProductRequest
 * @response 201 - Product created
 * @response 400 - Validation error
 */
router.post(
  '/products',
  validateBody(CreateProductRequestSchema),
  (req: Request, res: Response) => {
    const now = new Date().toISOString();
    const product: Product = {
      id: randomUUID(),
      ...req.body,
      createdAt: now,
      updatedAt: now,
    };

    products.set(product.id, product);
    res.status(201).json(product);
  }
);

/**
 * PUT /products/:id
 * @operationId updateProduct
 * @description Update an existing product
 * @param id - Product ID (UUID)
 * @body UpdateProductRequest
 * @response 200 - Product updated
 * @response 404 - Product not found
 * @response 400 - Validation error
 */
router.put(
  '/products/:id',
  validateBody(UpdateProductRequestSchema),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const existing = products.get(id);

    if (!existing) {
      const errorResponse: ErrorResponse = {
        code: 'NOT_FOUND',
        message: `Product with ID ${id} not found`,
        requestId: req.headers['x-request-id'] as string,
      };
      res.status(404).json(errorResponse);
      return;
    }

    const updated: Product = {
      ...existing,
      ...req.body,
      updatedAt: new Date().toISOString(),
    };

    products.set(id, updated);
    res.json(updated);
  }
);

/**
 * DELETE /products/:id
 * @operationId deleteProduct
 * @description Delete a product
 * @param id - Product ID (UUID)
 * @response 204 - Product deleted
 * @response 404 - Product not found
 */
router.delete('/products/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  if (!products.has(id)) {
    const errorResponse: ErrorResponse = {
      code: 'NOT_FOUND',
      message: `Product with ID ${id} not found`,
      requestId: req.headers['x-request-id'] as string,
    };
    res.status(404).json(errorResponse);
    return;
  }

  products.delete(id);
  res.status(204).send();
});

// ============================================================================
// Order Endpoints
// ============================================================================

/**
 * GET /orders
 * @operationId listOrders
 * @description List all orders with optional filtering
 * @query customerId - Filter by customer ID
 * @query status - Filter by order status
 * @response 200 - Paginated list of orders
 */
router.get('/orders', validateQuery(OrderQuerySchema), (req: Request, res: Response) => {
  const query = (req as any).validatedQuery;

  let filtered = Array.from(orders.values());

  if (query.customerId) {
    filtered = filtered.filter((o) => o.customerId === query.customerId);
  }
  if (query.status) {
    filtered = filtered.filter((o) => o.status === query.status);
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / query.limit);
  const start = (query.page - 1) * query.limit;
  const items = filtered.slice(start, start + query.limit);

  const response = OrderListResponseSchema.parse({
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
    },
  });

  res.json(response);
});

/**
 * GET /orders/:id
 * @operationId getOrder
 * @description Get an order by ID
 * @param id - Order ID (UUID)
 * @response 200 - Order details
 * @response 404 - Order not found
 */
router.get('/orders/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const order = orders.get(id);

  if (!order) {
    const errorResponse: ErrorResponse = {
      code: 'NOT_FOUND',
      message: `Order with ID ${id} not found`,
      requestId: req.headers['x-request-id'] as string,
    };
    res.status(404).json(errorResponse);
    return;
  }

  res.json(order);
});

/**
 * POST /orders
 * @operationId createOrder
 * @description Create a new order
 * @body CreateOrderRequest
 * @response 201 - Order created
 * @response 400 - Validation error
 * @response 422 - Product not found or out of stock
 */
router.post('/orders', validateBody(CreateOrderRequestSchema), (req: Request, res: Response) => {
  const body = req.body;
  const now = new Date().toISOString();

  // Validate products and calculate total
  const orderItems: Order['items'] = [];
  let totalAmount = 0;

  for (const item of body.items) {
    const product = products.get(item.productId);

    if (!product) {
      const errorResponse: ErrorResponse = {
        code: 'UNPROCESSABLE_ENTITY',
        message: `Product ${item.productId} not found`,
        requestId: req.headers['x-request-id'] as string,
      };
      res.status(422).json(errorResponse);
      return;
    }

    if (!product.inStock) {
      const errorResponse: ErrorResponse = {
        code: 'UNPROCESSABLE_ENTITY',
        message: `Product ${product.name} is out of stock`,
        requestId: req.headers['x-request-id'] as string,
      };
      res.status(422).json(errorResponse);
      return;
    }

    orderItems.push({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: product.price,
    });
    totalAmount += product.price * item.quantity;
  }

  const order: Order = {
    id: randomUUID(),
    customerId: body.customerId,
    items: orderItems,
    status: 'pending',
    totalAmount,
    currency: 'USD',
    shippingAddress: body.shippingAddress,
    notes: body.notes,
    createdAt: now,
    updatedAt: now,
  };

  orders.set(order.id, order);
  res.status(201).json(order);
});

/**
 * PATCH /orders/:id/status
 * @operationId updateOrderStatus
 * @description Update order status
 * @param id - Order ID (UUID)
 * @body UpdateOrderStatusRequest
 * @response 200 - Order status updated
 * @response 404 - Order not found
 * @response 400 - Validation error
 */
router.patch(
  '/orders/:id/status',
  validateBody(UpdateOrderStatusRequestSchema),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const existing = orders.get(id);

    if (!existing) {
      const errorResponse: ErrorResponse = {
        code: 'NOT_FOUND',
        message: `Order with ID ${id} not found`,
        requestId: req.headers['x-request-id'] as string,
      };
      res.status(404).json(errorResponse);
      return;
    }

    const updated: Order = {
      ...existing,
      status: req.body.status,
      notes: req.body.notes ?? existing.notes,
      updatedAt: new Date().toISOString(),
    };

    orders.set(id, updated);
    res.json(updated);
  }
);

export default router;
