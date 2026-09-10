/**
 * lib/db.js
 *
 * Database switcher.
 * - In production: uses lib/db-supabase.js (Supabase PostgreSQL multi-tenant)
 * - In local development: uses lib/db-local.js (Local JSON files)
 * 
 * This keeps your local testing environment completely isolated from prod.
 */

import * as localDb from './db-local.js';
import * as supabaseDb from './db-supabase.js';

const isProd = process.env.NODE_ENV === 'production';

export const getLinks = (...args) => isProd ? supabaseDb.getLinks(...args) : localDb.getLinks(...args);
export const getLinkBySlug = (...args) => isProd ? supabaseDb.getLinkBySlug(...args) : localDb.getLinkBySlug(...args);
export const addLink = (...args) => isProd ? supabaseDb.addLink(...args) : localDb.addLink(...args);
export const deleteLink = (...args) => isProd ? supabaseDb.deleteLink(...args) : localDb.deleteLink(...args);
export const updateLink = (...args) => isProd ? supabaseDb.updateLink(...args) : localDb.updateLink(...args);
export const getCategories = (...args) => isProd ? supabaseDb.getCategories(...args) : localDb.getCategories(...args);
export const getClicks = (...args) => isProd ? supabaseDb.getClicks(...args) : localDb.getClicks(...args);
export const getClicksBySlug = (...args) => isProd ? supabaseDb.getClicksBySlug(...args) : localDb.getClicksBySlug(...args);
export const addClick = (...args) => isProd ? supabaseDb.addClick(...args) : localDb.addClick(...args);
export const getStats = (...args) => isProd ? supabaseDb.getStats(...args) : localDb.getStats(...args);
