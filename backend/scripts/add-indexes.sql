-- =============================================================================
-- Performance Indexes Migration
-- =============================================================================
-- This script creates performance indexes for the PostgreSQL database.
-- Based on OPTIMIZATION_RECOMMENDATIONS.md analysis.
--
-- Usage: Run via add-indexes.js or manually against your database.
-- All indexes use IF NOT EXISTS to be safely re-runnable.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Link Table Indexes (lnk_project_site)
-- -----------------------------------------------------------------------------
-- These indexes optimize the frequently used project-site relationship joins.
-- The lnk_project_site table is queried on almost every project detail view.

-- Index for filtering by project (used when loading all sites for a project)
CREATE INDEX IF NOT EXISTS idx_lnk_project_site_project
  ON lnk_project_site(hub_project_id);

-- Index for filtering by site (used when looking up which projects contain a site)
CREATE INDEX IF NOT EXISTS idx_lnk_project_site_site
  ON lnk_project_site(hub_site_id);

-- Composite index for queries that filter on both columns simultaneously
-- Optimizes joins where both project and site are specified
CREATE INDEX IF NOT EXISTS idx_lnk_project_site_both
  ON lnk_project_site(hub_project_id, hub_site_id);

-- -----------------------------------------------------------------------------
-- 2. Site Attribute Indexes
-- -----------------------------------------------------------------------------
-- These indexes optimize the getSitesWithAttributes() and getBatchAttributeValues()
-- functions which are called for every project detail view.

-- Composite index for sat_site_attributes lookups
-- Optimizes: WHERE attribute_id = $1 AND hub_site_id = ANY($2)
CREATE INDEX IF NOT EXISTS idx_sat_site_attributes_attr_site
  ON sat_site_attributes(attribute_id, hub_site_id);

-- Material lookups - frequently joined to get material names for sites
CREATE INDEX IF NOT EXISTS idx_sat_site_material_site
  ON sat_site_material(hub_site_id);

-- Style lookups - architectural style attributes for sites
CREATE INDEX IF NOT EXISTS idx_sat_site_style_site
  ON sat_site_style(hub_site_id);

-- Type lookups - site type classifications
CREATE INDEX IF NOT EXISTS idx_sat_site_type_site
  ON sat_site_type(hub_site_id);

-- Use lookups - site use/function attributes
CREATE INDEX IF NOT EXISTS idx_sat_site_use_site
  ON sat_site_use(hub_site_id);

-- BBL (Borough-Block-Lot) lookups - NYC property identifiers
CREATE INDEX IF NOT EXISTS idx_sat_site_bbl_site
  ON sat_site_bbl(hub_site_id);

-- -----------------------------------------------------------------------------
-- 3. Project GUID Index
-- -----------------------------------------------------------------------------
-- Optimizes Box.com integration which looks up projects by their GUID
-- rather than their numeric ID.

CREATE INDEX IF NOT EXISTS idx_hub_projects_guid
  ON hub_projects(hub_project_guid);

-- -----------------------------------------------------------------------------
-- 4. Spatial Index (GIST)
-- -----------------------------------------------------------------------------
-- Optimizes all spatial queries including:
-- - Map rendering (finding sites within viewport)
-- - Clustering calculations
-- - Geometry-based filtering
-- Uses GIST (Generalized Search Tree) index type for PostGIS geometries.

CREATE INDEX IF NOT EXISTS idx_sat_site_geometry_geom
  ON sat_site_geometry USING GIST (shape);

-- =============================================================================
-- End of Migration
-- =============================================================================
