/**
 * Compile Service
 *
 * Wraps the compiler-openapi package for preview compilation.
 */

import type { ContractIR } from '@docsmyth/ir-spec';
import { compileOpenApi } from '@docsmyth/compiler-openapi';
import type { CompileResult } from '../types.js';

/**
 * Compile contract to OpenAPI (in-memory, no file write)
 */
export async function compileContract(contract: ContractIR): Promise<CompileResult> {
    try {
        const openapi = compileOpenApi(contract);
        return {
            ok: true,
            openapiJson: openapi,
        };
    } catch (e) {
        return {
            ok: false,
            error: e instanceof Error ? e.message : String(e),
        };
    }
}
