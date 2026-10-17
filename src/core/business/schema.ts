import '../zod-csp';
import { z } from 'zod';
import { BUSINESS_SUBTYPE_SLUGS } from './taxonomy';

/**
 * A stored business-type slug, validated against the taxonomy.
 *
 * `nullable` everywhere it is used because "no type" is a real state: the
 * three built-in templates have none, and every row written before this field
 * existed reads back as one. The read-side schema adds `.catch(null)` so a
 * slug the taxonomy no longer knows degrades instead of failing the row.
 */
export const businessSubtypeSlugSchema = z.enum(BUSINESS_SUBTYPE_SLUGS);
