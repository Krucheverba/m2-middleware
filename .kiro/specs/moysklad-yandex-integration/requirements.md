# Requirements Document

## Introduction

This document specifies the requirements for M2 Middleware - an integration system that synchronizes inventory and orders between МойСклад (inventory management system) and Яндекс.Маркет store M2. The system acts as a bridge, mapping product SKUs between the two platforms and ensuring data consistency.

## Glossary

- **МойСклад (MoySklad)**: Russian inventory management and accounting system, serving as the single source of truth for inventory data
- **M1**: First Яндекс.Маркет store, already integrated with МойСклад (out of scope for this middleware)
- **M2**: Second Яндекс.Маркет store, requires integration through this middleware
- **Middleware**: The integration system being specified in this document
- **offerId_M2**: Product identifier in M2 (Яндекс.Маркет), stored as a custom attribute in МойСклад for product mapping
- **externalCode**: Product identifier in МойСклад
- **SKU Mapping**: The relationship between offerId_M2 (M2 product ID) and externalCode (МойСклад product ID), established through the offerId_M2 custom attribute in МойСклад
- **Stock Sync**: The process of updating inventory quantities from МойСклад to M2
- **Order Transfer**: The process of creating customer orders in МойСклад based on M2 orders
- **Shipment Transfer**: The process of creating shipments in МойСклад when M2 orders are marked as shipped
- **Webhook**: HTTP callback triggered by МойСклад when specific events occur
- **Polling**: Periodic API requests to check for new orders or status changes in M2
- **Cron Job**: Scheduled task that runs at regular intervals as a fallback mechanism
- **Order Mapping File**: File stored on the server that maintains the relationship between M2 order IDs and МойСклад order IDs

## Requirements

### Requirement 1

**User Story:** As a store manager, I want inventory levels to be automatically synchronized from МойСклад to M2, so that customers see accurate stock availability on Яндекс.Маркет.

#### Acceptance Criteria

1. WHEN МойСклад sends a stock change webhook THEN the Middleware SHALL update the corresponding product stock on M2 immediately using the offerId_M2
2. WHEN a webhook fails to arrive or process THEN the Middleware SHALL synchronize all mapped products via cron job every 10-15 minutes
3. WHEN synchronizing stock THEN the Middleware SHALL only process products that have both externalCode and offerId_M2 attribute populated in МойСклад
4. WHEN a product exists in M2 but has no SKU mapping in МойСклад THEN the Middleware SHALL log an error and skip that product
5. WHEN reading product data from МойСклад THEN the Middleware SHALL retrieve the externalCode and the offerId_M2 custom attribute to establish the mapping for M2

### Requirement 2

**User Story:** As a store manager, I want M2 orders to be automatically created in МойСклад, so that inventory is reserved and order fulfillment can begin.

#### Acceptance Criteria

1. WHEN the Middleware polls M2 and finds a new order THEN the Middleware SHALL create a customer order (Заказ покупателя) in МойСклад with reserved inventory
2. WHEN creating an order in МойСклад THEN the Middleware SHALL map each offerId_M2 from M2 to the corresponding externalCode in МойСклад using the offerId_M2 custom attribute
3. WHEN an order contains a product without SKU mapping THEN the Middleware SHALL log an error and mark the order for manual processing
4. WHEN an order is successfully created in МойСклад THEN the Middleware SHALL store the M2 order ID and МойСклад order reference for future shipment processing
5. WHEN polling for orders THEN the Middleware SHALL check for new orders every 5-10 minutes as specified in configuration

### Requirement 3

**User Story:** As a store manager, I want M2 shipments to be automatically recorded in МойСклад, so that inventory is accurately decremented and sales are tracked.

#### Acceptance Criteria

1. WHEN the Middleware polls M2 and finds an order with status SHIPPED THEN the Middleware SHALL create a shipment (Отгрузка) in МойСклад
2. WHEN creating a shipment THEN the Middleware SHALL reference the previously created customer order in МойСклад using the stored order reference
3. WHEN a shipment is created THEN the Middleware SHALL decrement inventory quantities in МойСклад for all order items
4. WHEN a shipment is successfully created THEN the Middleware SHALL update the customer order status in МойСклад to closed or completed
5. WHEN a shipment event is received for an unknown order THEN the Middleware SHALL log an error and skip shipment creation

### Requirement 4

**User Story:** As a system administrator, I want the middleware to handle webhook events from МойСклад, so that inventory changes are propagated to M2 in real-time.

#### Acceptance Criteria

1. WHEN the Middleware receives a webhook request from МойСклад THEN the Middleware SHALL validate the request authenticity
2. WHEN a stock change event is received THEN the Middleware SHALL extract the product identifier and new stock quantity
3. WHEN processing a webhook event THEN the Middleware SHALL update M2 stock within 5 seconds of receiving the event
4. WHEN a webhook processing fails THEN the Middleware SHALL log the error and rely on cron job for eventual consistency

### Requirement 5

**User Story:** As a system administrator, I want scheduled polling mechanisms, so that orders and stock synchronization continues reliably.

#### Acceptance Criteria

1. WHEN the stock sync cron job executes THEN the Middleware SHALL retrieve all products from МойСклад that have both externalCode and offerId_M2 attribute populated
2. WHEN the stock sync cron job runs THEN the Middleware SHALL update stock quantities on M2 for all mapped products
3. WHEN the order polling cron job executes THEN the Middleware SHALL retrieve new and updated orders from M2 and process them
4. WHEN cron jobs are configured THEN the Middleware SHALL execute stock sync every 10-15 minutes and order polling every 5-10 minutes as specified in configuration
5. WHEN a cron job encounters an error THEN the Middleware SHALL log the error and continue with the next scheduled execution

### Requirement 6

**User Story:** As a system administrator, I want comprehensive error logging, so that I can identify and resolve integration issues quickly.

#### Acceptance Criteria

1. WHEN a SKU mapping is missing for a product THEN the Middleware SHALL log an error with the offerId_M2 from M2, externalCode from МойСклад, and the offerId_M2 attribute value
2. WHEN an API call to МойСклад or M2 fails THEN the Middleware SHALL log the error with request details and error response
3. WHEN an order contains unmapped products THEN the Middleware SHALL log the M2 order ID and list of unmapped offerIds_M2
4. WHEN logging errors THEN the Middleware SHALL include timestamp, error type, and relevant identifiers for troubleshooting
5. WHEN the system is running normally THEN the Middleware SHALL only log errors, not routine operations

### Requirement 7

**User Story:** As a developer, I want the system to be configurable via environment variables, so that it can be deployed in different environments without code changes.

#### Acceptance Criteria

1. WHEN the Middleware starts THEN the Middleware SHALL load configuration from environment variables including YANDEX_CAMPAIGN_ID, YANDEX_TOKEN, MS_TOKEN, and sync intervals
2. WHEN configuration is missing or invalid THEN the Middleware SHALL fail to start and log a clear error message
3. WHEN configuration includes API credentials THEN the Middleware SHALL store them securely and never log them
4. WHEN sync intervals are configured THEN the Middleware SHALL use STOCK_SYNC_INTERVAL_MINUTES for stock synchronization and ORDER_POLL_INTERVAL_MINUTES for order polling
5. WHEN the log level is configured THEN the Middleware SHALL respect that setting for all logging operations

### Requirement 8

**User Story:** As a system administrator, I want the middleware to store order mappings, so that shipments can be correctly linked to customer orders.

#### Acceptance Criteria

1. WHEN a customer order is created in МойСклад THEN the Middleware SHALL store the mapping between M2 order ID and МойСклад order ID in a file on the server
2. WHEN processing a shipment from M2 THEN the Middleware SHALL retrieve the corresponding МойСклад order ID from the mapping file
3. WHEN the mapping file is read THEN the Middleware SHALL return the МойСклад order reference within 100 milliseconds
4. WHEN an order mapping already exists THEN the Middleware SHALL not create a duplicate entry
5. WHEN the mapping file is unavailable or corrupted THEN the Middleware SHALL log an error and continue processing other operations

### Requirement 9

**User Story:** As a system administrator, I want the middleware to be resilient to temporary API failures, so that transient network issues don't cause data loss.

#### Acceptance Criteria

1. WHEN an API call to M2 fails during polling THEN the Middleware SHALL log the error and retry on the next scheduled poll
2. WHEN an API call to МойСклад fails THEN the Middleware SHALL log the error and continue processing other requests
3. WHEN the system encounters rate limiting THEN the Middleware SHALL respect the rate limits and retry after the specified delay
4. WHEN multiple consecutive API failures occur THEN the Middleware SHALL continue logging errors without crashing
