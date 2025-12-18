/**
 * IR Validation Module
 *
 * Provides validation for Contract IR documents.
 * Returns structured errors with meaningful paths for debugging.
 */

import type { ContractIR, IRVersion } from './types.js';

/**
 * Validation error detail
 */
export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Supported IR versions
 */
const SUPPORTED_VERSIONS: IRVersion[] = ['0.1'];

/**
 * Valid HTTP methods
 */
const VALID_HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

/**
 * Validates a Contract IR document
 *
 * @param ir - The IR document to validate (can be unknown for runtime validation)
 * @returns Validation result with errors and warnings
 *
 * @example
 * ```ts
 * import { validate } from '@docsmyth/ir-spec';
 *
 * const result = validate(irDocument);
 * if (!result.valid) {
 *   console.error('Validation failed:', result.errors);
 * }
 * ```
 */
export function validate(ir: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Basic type check
  if (!ir || typeof ir !== 'object') {
    return {
      valid: false,
      errors: [
        {
          path: '',
          message: 'IR document must be an object',
          code: 'INVALID_TYPE',
        },
      ],
      warnings: [],
    };
  }

  const doc = ir as Record<string, unknown>;

  // Check irVersion - must be exactly "0.1"
  if (!doc.irVersion) {
    errors.push({
      path: 'irVersion',
      message: 'irVersion is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (typeof doc.irVersion !== 'string') {
    errors.push({
      path: 'irVersion',
      message: 'irVersion must be a string',
      code: 'INVALID_TYPE',
    });
  } else if (!SUPPORTED_VERSIONS.includes(doc.irVersion as IRVersion)) {
    errors.push({
      path: 'irVersion',
      message: `irVersion must be "0.1". Got: "${doc.irVersion}"`,
      code: 'UNSUPPORTED_VERSION',
    });
  }

  // Check service
  if (!doc.service) {
    errors.push({
      path: 'service',
      message: 'service is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (typeof doc.service !== 'object' || doc.service === null) {
    errors.push({
      path: 'service',
      message: 'service must be an object',
      code: 'INVALID_TYPE',
    });
  } else {
    const service = doc.service as Record<string, unknown>;
    if (!service.name) {
      errors.push({
        path: 'service.name',
        message: 'service.name is required',
        code: 'REQUIRED_FIELD',
      });
    } else if (typeof service.name !== 'string') {
      errors.push({
        path: 'service.name',
        message: 'service.name must be a string',
        code: 'INVALID_TYPE',
      });
    }
    if (!service.version) {
      errors.push({
        path: 'service.version',
        message: 'service.version is required',
        code: 'REQUIRED_FIELD',
      });
    } else if (typeof service.version !== 'string') {
      errors.push({
        path: 'service.version',
        message: 'service.version must be a string',
        code: 'INVALID_TYPE',
      });
    }

    // Validate baseUrls if present
    if (service.baseUrls !== undefined) {
      if (!Array.isArray(service.baseUrls)) {
        errors.push({
          path: 'service.baseUrls',
          message: 'service.baseUrls must be an array',
          code: 'INVALID_TYPE',
        });
      } else {
        service.baseUrls.forEach((url, index) => {
          if (typeof url !== 'string') {
            errors.push({
              path: `service.baseUrls[${index}]`,
              message: 'Each baseUrl must be a string',
              code: 'INVALID_TYPE',
            });
          }
        });
      }
    }
  }

  // Check schemas - must be an object with object values
  if (!doc.schemas) {
    errors.push({
      path: 'schemas',
      message: 'schemas is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (
    typeof doc.schemas !== 'object' ||
    doc.schemas === null ||
    Array.isArray(doc.schemas)
  ) {
    errors.push({
      path: 'schemas',
      message: 'schemas must be an object (record of schema definitions)',
      code: 'INVALID_TYPE',
    });
  } else {
    // Validate each schema is an object
    const schemas = doc.schemas as Record<string, unknown>;
    for (const [name, schema] of Object.entries(schemas)) {
      if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
        errors.push({
          path: `schemas.${name}`,
          message: `Schema "${name}" must be an object`,
          code: 'INVALID_SCHEMA',
        });
      }
    }
  }

  // Check operations
  if (!doc.operations) {
    errors.push({
      path: 'operations',
      message: 'operations is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (!Array.isArray(doc.operations)) {
    errors.push({
      path: 'operations',
      message: 'operations must be an array',
      code: 'INVALID_TYPE',
    });
  } else {
    // Validate each operation
    const seenOperationIds = new Set<string>();
    (doc.operations as unknown[]).forEach((op, index) => {
      const opPath = `operations[${index}]`;

      if (!op || typeof op !== 'object' || Array.isArray(op)) {
        errors.push({
          path: opPath,
          message: 'Operation must be an object',
          code: 'INVALID_TYPE',
        });
        return;
      }

      const operation = op as Record<string, unknown>;

      // operationId is required
      if (!operation.operationId) {
        errors.push({
          path: `${opPath}.operationId`,
          message: 'operationId is required',
          code: 'REQUIRED_FIELD',
        });
      } else if (typeof operation.operationId !== 'string') {
        errors.push({
          path: `${opPath}.operationId`,
          message: 'operationId must be a string',
          code: 'INVALID_TYPE',
        });
      } else {
        // Check for duplicate operationIds
        if (seenOperationIds.has(operation.operationId)) {
          errors.push({
            path: `${opPath}.operationId`,
            message: `Duplicate operationId: "${operation.operationId}"`,
            code: 'DUPLICATE_OPERATION_ID',
          });
        } else {
          seenOperationIds.add(operation.operationId);
        }
      }

      // method is required for HTTP operations
      if (!operation.method) {
        errors.push({
          path: `${opPath}.method`,
          message: 'method is required for HTTP operations',
          code: 'REQUIRED_FIELD',
        });
      } else if (typeof operation.method !== 'string') {
        errors.push({
          path: `${opPath}.method`,
          message: 'method must be a string',
          code: 'INVALID_TYPE',
        });
      } else {
        const upperMethod = operation.method.toUpperCase();
        if (!VALID_HTTP_METHODS.includes(upperMethod as (typeof VALID_HTTP_METHODS)[number])) {
          errors.push({
            path: `${opPath}.method`,
            message: `Invalid HTTP method: "${operation.method}". Must be one of: ${VALID_HTTP_METHODS.join(', ')}`,
            code: 'INVALID_METHOD',
          });
        }
      }

      // path is required for HTTP operations
      if (!operation.path) {
        errors.push({
          path: `${opPath}.path`,
          message: 'path is required for HTTP operations',
          code: 'REQUIRED_FIELD',
        });
      } else if (typeof operation.path !== 'string') {
        errors.push({
          path: `${opPath}.path`,
          message: 'path must be a string',
          code: 'INVALID_TYPE',
        });
      } else if (!operation.path.startsWith('/')) {
        errors.push({
          path: `${opPath}.path`,
          message: 'path must start with /',
          code: 'INVALID_PATH',
        });
      }

      // responses is required
      if (!operation.responses) {
        errors.push({
          path: `${opPath}.responses`,
          message: 'responses array is required',
          code: 'REQUIRED_FIELD',
        });
      } else if (!Array.isArray(operation.responses)) {
        errors.push({
          path: `${opPath}.responses`,
          message: 'responses must be an array',
          code: 'INVALID_TYPE',
        });
      } else {
        // Validate each response
        (operation.responses as unknown[]).forEach((resp, respIndex) => {
          const respPath = `${opPath}.responses[${respIndex}]`;
          if (!resp || typeof resp !== 'object' || Array.isArray(resp)) {
            errors.push({
              path: respPath,
              message: 'Response must be an object',
              code: 'INVALID_TYPE',
            });
            return;
          }

          const response = resp as Record<string, unknown>;
          if (response.statusCode === undefined) {
            errors.push({
              path: `${respPath}.statusCode`,
              message: 'statusCode is required for each response',
              code: 'REQUIRED_FIELD',
            });
          } else if (
            typeof response.statusCode !== 'number' ||
            !Number.isInteger(response.statusCode)
          ) {
            errors.push({
              path: `${respPath}.statusCode`,
              message: 'statusCode must be an integer',
              code: 'INVALID_TYPE',
            });
          } else if (response.statusCode < 100 || response.statusCode > 599) {
            errors.push({
              path: `${respPath}.statusCode`,
              message: 'statusCode must be between 100 and 599',
              code: 'INVALID_STATUS_CODE',
            });
          }

          // Validate response schema if present
          if (response.schema !== undefined) {
            if (typeof response.schema !== 'object' || response.schema === null) {
              errors.push({
                path: `${respPath}.schema`,
                message: 'Response schema must be an object',
                code: 'INVALID_TYPE',
              });
            }
          }
        });
      }

      // Validate requestBody if present
      if (operation.requestBody !== undefined) {
        if (typeof operation.requestBody !== 'object' || operation.requestBody === null) {
          errors.push({
            path: `${opPath}.requestBody`,
            message: 'requestBody must be an object',
            code: 'INVALID_TYPE',
          });
        } else {
          const reqBody = operation.requestBody as Record<string, unknown>;
          if (reqBody.schema !== undefined) {
            if (typeof reqBody.schema !== 'object' || reqBody.schema === null) {
              errors.push({
                path: `${opPath}.requestBody.schema`,
                message: 'requestBody.schema must be an object',
                code: 'INVALID_TYPE',
              });
            }
          }
        }
      }

      // Validate parameters if present
      if (operation.parameters !== undefined) {
        if (!Array.isArray(operation.parameters)) {
          errors.push({
            path: `${opPath}.parameters`,
            message: 'parameters must be an array',
            code: 'INVALID_TYPE',
          });
        } else {
          (operation.parameters as unknown[]).forEach((param, paramIndex) => {
            const paramPath = `${opPath}.parameters[${paramIndex}]`;
            if (!param || typeof param !== 'object' || Array.isArray(param)) {
              errors.push({
                path: paramPath,
                message: 'Parameter must be an object',
                code: 'INVALID_TYPE',
              });
              return;
            }

            const parameter = param as Record<string, unknown>;
            if (!parameter.name || typeof parameter.name !== 'string') {
              errors.push({
                path: `${paramPath}.name`,
                message: 'Parameter name is required and must be a string',
                code: 'REQUIRED_FIELD',
              });
            }
            if (!parameter.in || typeof parameter.in !== 'string') {
              errors.push({
                path: `${paramPath}.in`,
                message: 'Parameter "in" is required and must be a string',
                code: 'REQUIRED_FIELD',
              });
            } else if (!['path', 'query', 'header', 'cookie'].includes(parameter.in)) {
              errors.push({
                path: `${paramPath}.in`,
                message: `Invalid parameter location: "${parameter.in}". Must be one of: path, query, header, cookie`,
                code: 'INVALID_PARAM_LOCATION',
              });
            }
          });
        }
      }

      // Validate tags if present
      if (operation.tags !== undefined) {
        if (!Array.isArray(operation.tags)) {
          errors.push({
            path: `${opPath}.tags`,
            message: 'tags must be an array',
            code: 'INVALID_TYPE',
          });
        } else {
          (operation.tags as unknown[]).forEach((tag, tagIndex) => {
            if (typeof tag !== 'string') {
              errors.push({
                path: `${opPath}.tags[${tagIndex}]`,
                message: 'Each tag must be a string',
                code: 'INVALID_TYPE',
              });
            }
          });
        }
      }
    });
  }

  // Validate securitySchemes if present
  if (doc.securitySchemes !== undefined) {
    if (
      typeof doc.securitySchemes !== 'object' ||
      doc.securitySchemes === null ||
      Array.isArray(doc.securitySchemes)
    ) {
      errors.push({
        path: 'securitySchemes',
        message: 'securitySchemes must be an object',
        code: 'INVALID_TYPE',
      });
    } else {
      const schemes = doc.securitySchemes as Record<string, unknown>;
      for (const [name, scheme] of Object.entries(schemes)) {
        if (typeof scheme !== 'object' || scheme === null) {
          errors.push({
            path: `securitySchemes.${name}`,
            message: `Security scheme "${name}" must be an object`,
            code: 'INVALID_TYPE',
          });
          continue;
        }
        const schemeObj = scheme as Record<string, unknown>;
        if (!schemeObj.type) {
          errors.push({
            path: `securitySchemes.${name}.type`,
            message: 'Security scheme type is required',
            code: 'REQUIRED_FIELD',
          });
        } else if (
          !['apiKey', 'http', 'oauth2', 'openIdConnect'].includes(schemeObj.type as string)
        ) {
          errors.push({
            path: `securitySchemes.${name}.type`,
            message: `Invalid security scheme type: "${schemeObj.type}". Must be one of: apiKey, http, oauth2, openIdConnect`,
            code: 'INVALID_SECURITY_TYPE',
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Type guard to check if an object is a valid ContractIR
 */
export function isContractIR(value: unknown): value is ContractIR {
  const result = validate(value);
  return result.valid;
}
