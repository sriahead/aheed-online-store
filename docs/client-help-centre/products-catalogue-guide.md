---
id: products-catalogue-guide
title: "Products & Catalogue Management Guide"
audience: [store-admin, staff]
type: guide
status: approved
version: "1.0.0"
updated: 2026-10-25
visibility: internal
summary: "Complete guide to catalogue management, bulk Excel spreadsheet imports, template specifications, validation error handling, and stock controls."
tags: [catalogue, products, bulk-import, excel, inventory, stock]
related: [store-admin-tabs-guide, staff-tabs-guide]
---

# Products & Catalogue Management Guide

This guide details product creation, category organization, stock synchronization, and bulk spreadsheet imports.

---

## 1. Product Structure & Safeguards

Every product in the catalogue enforces strict data consistency rules:
- **Pricing:** Stored internally as integer pence (e.g. £3.49 is stored as `349`). Floating-point currency values are never stored.
- **Stock Tracking:** Products can have explicit numerical stock levels (`stockQuantity`) or an active/inactive availability toggle (`isActive`).
- **Images:** Image keys are immutable relative paths stored in Cloudflare R2 object storage. Full URLs are composed dynamically at runtime via `CDN_BASE_URL`.
- **Badges & Attributes:** Products support structured dietary and quality badges (Halal, Organic, Fresh Produce).

---

## 2. Bulk Excel Import (`/staff/products/import`)

### 2.1 File Formats & Templates
- Supported formats: Modern Excel (`.xlsx`) and legacy Excel (`.xls`).
- The standard template can be downloaded directly from the `/staff/products/import` screen.

### 2.2 Column Specifications

| Column Name | Required | Data Type | Example | Description |
| :--- | :---: | :--- | :--- | :--- |
| **Product Name** | Yes | Text | Whole Milk 2L | Clear customer-facing title. |
| **Category** | Yes | Text | Dairy | Root category name. Created automatically if missing. |
| **Subcategory** | No | Text | Fresh Milk | Optional child category for nested browsing. |
| **Price (£)** | Yes | Number / Text | 1.85 | Price in pounds. Automatically parsed to integer pence (185). |
| **Barcode / SKU** | No | Text / Number | 5012345678901 | GTIN/EAN barcode for POS and quick scanning. |
| **Stock Level** | No | Integer | 50 | Initial inventory count. Defaults to 0 if omitted. |
| **Unit / Net Content** | No | Text | 2 L | Physical volume/weight. |

### 2.3 Import Preview & Error Validation
1. **Validation Step:** Before any database write, the importer runs pre-flight validation on every row.
2. **Common Validation Errors:**
   - *Missing Required Field:* Row has no Product Name or Price.
   - *Invalid Price Format:* Price contains non-numeric symbols (e.g. `$1.99` instead of `1.99`).
   - *Duplicate Barcodes:* Two rows share the same barcode.
3. **Commit Step:** Once validation is reviewed, clicking "Confirm Import" writes products to PostgreSQL using transactional batch inserts.

---

## 3. Live Inventory & Stock Toggles (`/staff/inventory`)

During busy trading periods, store staff can quickly adjust stock without opening full product forms:
- **Instant Stock Toggle:** Mark any item as "Out of Stock" with a single click. The storefront immediately displays an "Out of Stock" badge and disables the "Add to Cart" button.
- **Quick Quantity Adjustment:** Adjust numerical stock (+1, -1, +10) directly in the inventory table.
- **Low Stock Alerts:** Items with fewer than 5 units remaining are visually highlighted for restocking.
