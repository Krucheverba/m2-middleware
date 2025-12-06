# Design Document

## Overview

M2 Middleware is a Node.js-based integration service that synchronizes inventory and orders between МойСклад (inventory management system) and Яндекс.Маркет store M2. The system operates as a bidirectional bridge:

- **МойСклад → M2**: Real-time stock synchronization via webhooks with cron fallback
- **M2 → МойСклад**: Order and shipment transfer via polling

The middleware uses SKU mapping (offerId_M2 ↔ externalCode) to translate product identifiers between systems and maintains order mappings in a local file for shipment processing.

## Architecture

### High-Level Architecture

```
┌─────────────┐         Webhook          ┌──────────────┐
│  МойСклад   │ ────────────────────────> │              │
│             │                           │              │
│             │ <──── Create Orders ───── │  Middleware  │
│             │ <──── Create Shipments ── │              │
└─────────────┘                           │              │
                                          │              │
┌─────────────┐         Polling          │              │
│  Яндекс M2  │ <──────────────────────> │              │
│             │    Update Stocks          │              │
└─────────────┘                           └──────────────┘
                                                 │
                                                 │
                                          ┌──────▼──────┐
                                          │ Order       │
                                          │ Mapping     │
                                          │ File        │
                                          └─────────────┘
```

### Component Architecture

The system follows a layered architecture:

1. **API Layer**: Express.js server handling webhook endpoints
2. **Service Layer**: Business logic for stock sync, order transfer, and shipment processing
3. **Client Layer**: HTTP clients for МойСклад and Яндекс.Маркет APIs
4. **Storage Layer**: File-based storage for order mappings
5. **Scheduler Layer**: Cron jobs for polling and fallback synchronization

## Components and Interfaces

### 1. API Clients

#### MoySkladClient
```javascript
class MoySkladClient {
  // Get all products with externalCode and offerId_M2 mapping
  async getProducts(filter)
  
  // Get product stock levels
  async getProductStock(productId)
  
  // Create customer order (Заказ покупателя)
  async createCustomerOrder(orderData)
  
  // Create shipment (Отгрузка)
  async createShipment(shipmentData)
  
  // Update customer order status
  async updateOrderStatus(orderId, status)
}
```

#### YandexClient
```javascript
class YandexClient {
  // Update stock for multiple products (batch up to 2000)
  async updateStocks(stockUpdates)
  
  // Get orders with filtering by status and date
  async getOrders(filters)
  
  // Get specific order details
  async getOrder(orderId)
}
```

### 2. Services

#### StockService
```javascript
class StockService {
  // Handle webhook from МойСклад for stock changes
  async handleStockWebhook(webhookData)
  
  // Sync all stocks from МойСклад to M2 (cron job)
  async syncAllStocks()
  
  // Update single product stock in M2
  async updateM2Stock(externalCode, offerId_M2, quantity)
}
```

#### OrderService
```javascript
class OrderService {
  // Poll M2 for new orders and create in МойСклад
  async pollAndProcessOrders()
  
  // Create customer order in МойСклад
  async createMoySkladOrder(m2Order)
  
  // Process shipped orders and create shipments
  async processShippedOrders()
  
  // Create shipment in МойСклад and close order
  async createShipment(m2OrderId)
}
```

#### MapperService
```javascript
class MapperService {
  // Map offerId_M2 to externalCode
  async mapOfferIdToExternalCode(offerId_M2)
  
  // Map externalCode to offerId_M2
  async mapExternalCodeToOfferId(externalCode)
  
  // Load SKU mappings from МойСклад
  async loadMappings()
  
  // Save order mapping to file
  async saveOrderMapping(m2OrderId, moySkladOrderId)
  
  // Get МойСклад order ID by M2 order ID
  async getMoySkladOrderId(m2OrderId)
}
```

### 3. Storage

#### OrderMappingStore
```javascript
class OrderMappingStore {
  // Save mapping to file
  async save(m2OrderId, moySkladOrderId)
  
  // Get mapping from file
  async get(m2OrderId)
  
  // Check if mapping exists
  async exists(m2OrderId)
  
  // Load all mappings into memory
  async loadAll()
}
```

### 4. Scheduler

#### CronScheduler
```javascript
class CronScheduler {
  // Schedule stock sync job
  scheduleStockSync(intervalMinutes)
  
  // Schedule order polling job
  scheduleOrderPolling(intervalMinutes)
  
  // Stop all jobs
  stopAll()
}
```

## Data Models

### Product Mapping
```javascript
{
  externalCode: string,    // МойСклад product identifier
  offerId_M2: string,      // M2 (Яндекс.Маркет) product identifier
  name: string,            // Product name
  stock: number            // Current stock quantity
}
```

### M2 Order
```javascript
{
  id: string,              // M2 order ID
  status: string,          // ORDER_STATUS (PROCESSING, SHIPPED, etc.)
  items: [
    {
      offerId_M2: string,  // Product identifier in M2
      count: number,       // Quantity
      price: number        // Unit price
    }
  ],
  delivery: {
    address: string,
    recipient: string
  }
}
```

### МойСклад Customer Order
```javascript
{
  id: string,              // МойСклад order ID
  name: string,            // Order number
  positions: [
    {
      assortment: {
        meta: {
          href: string     // Product reference
        }
      },
      quantity: number,
      price: number,
      reserve: number      // Reserved quantity
    }
  ],
  agent: {
    meta: {
      href: string         // Customer reference
    }
  }
}
```

### Order Mapping (File Storage)
```javascript
{
  m2OrderId: string,       // M2 order ID
  moySkladOrderId: string, // МойСклад order ID
  createdAt: string        // ISO timestamp
}
```

## Correctness Properties


*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Stock Synchronization Properties

**Property 1: Stock webhook updates M2**
*For any* stock change webhook from МойСклад with valid externalCode and offerId_M2 mapping, the middleware should update the corresponding product stock in M2 with the correct quantity.
**Validates: Requirements 1.1**

**Property 2: Only mapped products are synchronized**
*For any* set of products from МойСклад, only products that have both externalCode and offerId_M2 populated should be included in stock synchronization.
**Validates: Requirements 1.3, 5.1**

**Property 3: Unmapped products are skipped with errors**
*For any* product without SKU mapping, the middleware should skip the product and log an error containing the product identifier.
**Validates: Requirements 1.4**

**Property 4: ExternalCode maps to offerId_M2 correctly**
*For any* product with both externalCode and offerId_M2, the mapper service should return the correct offerId_M2 when given the externalCode.
**Validates: Requirements 1.5**

**Property 5: Cron job processes all mapped products**
*For any* execution of the stock sync cron job, all products with valid mappings should be processed and their stocks updated in M2.
**Validates: Requirements 5.2**

### Order Transfer Properties

**Property 6: New M2 orders create МойСклад orders**
*For any* new order from M2 with all products mapped, the middleware should create a customer order in МойСклад with reserved inventory for all items.
**Validates: Requirements 2.1**

**Property 7: Order items are mapped correctly**
*For any* order from M2, each offerId_M2 in the order should be mapped to the corresponding externalCode when creating the МойСклад order.
**Validates: Requirements 2.2**

**Property 8: Orders with unmapped products are flagged**
*For any* order containing at least one product without SKU mapping, the middleware should log an error and mark the order for manual processing.
**Validates: Requirements 2.3**

**Property 9: Order mappings are saved**
*For any* successfully created customer order in МойСклад, the middleware should save the mapping between M2 order ID and МойСклад order ID to the mapping file.
**Validates: Requirements 2.4, 8.1**

**Property 10: Order polling retrieves new orders**
*For any* execution of the order polling cron job, all new orders from M2 should be retrieved and processed.
**Validates: Requirements 5.3**

### Shipment Transfer Properties

**Property 11: Shipped orders create shipments**
*For any* order in M2 with status SHIPPED and a valid order mapping, the middleware should create a shipment in МойСклад.
**Validates: Requirements 3.1**

**Property 12: Shipments reference correct orders**
*For any* shipment created in МойСклад, it should reference the correct customer order using the order mapping retrieved from the mapping file.
**Validates: Requirements 3.2, 8.2**

**Property 13: Order status is updated after shipment**
*For any* successfully created shipment in МойСклад, the corresponding customer order status should be updated to closed or completed.
**Validates: Requirements 3.4**

**Property 14: Unknown orders are skipped**
*For any* shipment event for an order ID that doesn't exist in the mapping file, the middleware should log an error and skip shipment creation.
**Validates: Requirements 3.5**

### Webhook Processing Properties

**Property 15: Invalid webhooks are rejected**
*For any* webhook request that fails authenticity validation, the middleware should reject the request and not process it.
**Validates: Requirements 4.1**

**Property 16: Webhook data is extracted correctly**
*For any* valid stock change webhook, the middleware should correctly extract the product identifier and new stock quantity.
**Validates: Requirements 4.2**

### Error Handling Properties

**Property 17: Cron errors don't stop execution**
*For any* cron job that encounters an error during execution, the error should be logged and the next scheduled execution should proceed normally.
**Validates: Requirements 5.5**

**Property 18: Missing mapping errors include identifiers**
*For any* product with missing SKU mapping, the error log should contain both the offerId_M2 and externalCode (if available).
**Validates: Requirements 6.1**

**Property 19: API errors include request details**
*For any* failed API call to МойСклад or M2, the error log should contain request details and the error response.
**Validates: Requirements 6.2**

**Property 20: Unmapped product errors include order context**
*For any* order containing unmapped products, the error log should contain the M2 order ID and the list of unmapped offerIds_M2.
**Validates: Requirements 6.3**

**Property 21: Error logs have required fields**
*For any* error logged by the middleware, the log entry should include timestamp, error type, and relevant identifiers.
**Validates: Requirements 6.4**

**Property 22: Normal operations are not logged at error level**
*For any* routine operation when log level is set to error, no log entry should be created.
**Validates: Requirements 6.5**

### Configuration Properties

**Property 23: Missing configuration prevents startup**
*For any* required environment variable that is missing or invalid, the middleware should fail to start and log a clear error message.
**Validates: Requirements 7.2**

**Property 24: Credentials are never logged**
*For any* log entry created by the middleware, it should not contain API credentials (YANDEX_TOKEN, MS_TOKEN).
**Validates: Requirements 7.3**

**Property 25: Log level is respected**
*For any* log operation, the log entry should only be created if its level meets or exceeds the configured log level.
**Validates: Requirements 7.5**

### Order Mapping Storage Properties

**Property 26: Order mappings are retrievable**
*For any* order mapping saved to the file, the same mapping should be retrievable by querying with the M2 order ID.
**Validates: Requirements 8.2**

**Property 27: Duplicate mappings are not created**
*For any* order mapping that already exists in the file, attempting to save it again should not create a duplicate entry.
**Validates: Requirements 8.4**

**Property 28: File errors don't crash the system**
*For any* file operation error (unavailable or corrupted file), the middleware should log the error and continue processing other operations.
**Validates: Requirements 8.5**

### Resilience Properties

**Property 29: Failed polls are retried**
*For any* API call to M2 that fails during polling, the error should be logged and the operation should be retried on the next scheduled poll.
**Validates: Requirements 9.1**

**Property 30: Failed requests are isolated**
*For any* API call to МойСклад that fails, the error should be logged and other pending requests should continue to be processed.
**Validates: Requirements 9.2**

**Property 31: Rate limits are respected**
*For any* API response indicating rate limiting, the middleware should wait for the specified delay before retrying.
**Validates: Requirements 9.3**

**Property 32: Multiple failures don't crash the system**
*For any* sequence of consecutive API failures, the middleware should continue logging errors without crashing.
**Validates: Requirements 9.4**

## Error Handling

### Error Categories

1. **Mapping Errors**: Missing or invalid SKU mappings between offerId_M2 and externalCode
2. **API Errors**: Failed requests to МойСклад or Яндекс.Маркет APIs
3. **File Errors**: Issues reading or writing the order mapping file
4. **Validation Errors**: Invalid webhook data or configuration
5. **Network Errors**: Timeouts, connection failures, rate limiting

### Error Handling Strategy

#### Mapping Errors
- Log error with product identifiers (offerId_M2, externalCode, product name)
- Skip the problematic product
- Continue processing other products
- Mark orders with unmapped products for manual review

#### API Errors
- Log error with full request details and response
- For webhook processing: rely on cron job for eventual consistency
- For polling: retry on next scheduled execution
- For rate limiting: respect retry-after headers
- Never crash the system due to API failures

#### File Errors
- Log error with file path and operation details
- For read errors: treat as "mapping not found"
- For write errors: log and continue (order can be manually mapped later)
- Implement file locking to prevent concurrent write conflicts

#### Validation Errors
- For webhooks: reject invalid requests with 400 status
- For configuration: fail fast at startup with clear error message
- For order data: log error and skip invalid orders

#### Network Errors
- Implement exponential backoff for retries
- Respect rate limits from API responses
- Log all network errors with timestamps
- Continue processing other operations

### Logging Strategy

#### Log Levels
- **ERROR**: Mapping failures, API errors, file errors, validation failures
- **WARN**: Rate limiting, retries, fallback to cron job
- **INFO**: Startup, configuration loaded, cron job execution (only if LOG_LEVEL=info)
- **DEBUG**: Detailed request/response data (only if LOG_LEVEL=debug)

#### Log Format
```javascript
{
  timestamp: ISO8601,
  level: string,
  message: string,
  context: {
    errorType: string,
    identifiers: object,
    requestDetails: object,  // excluding credentials
    errorResponse: object
  }
}
```

#### Security
- Never log API credentials (YANDEX_TOKEN, MS_TOKEN)
- Sanitize all log entries before writing
- Implement log rotation to prevent disk space issues

## Testing Strategy

### Unit Testing

The system will use **Jest** as the testing framework for unit tests. Unit tests will focus on:

1. **Mapper Service**
   - Test SKU mapping functions with various input combinations
   - Test order mapping save/retrieve operations
   - Test file operations with mocked file system

2. **API Clients**
   - Test request formatting with mocked HTTP client
   - Test response parsing with sample API responses
   - Test error handling with various error scenarios

3. **Services**
   - Test business logic with mocked dependencies
   - Test error handling and logging
   - Test edge cases (empty orders, missing data, etc.)

4. **Configuration**
   - Test environment variable loading
   - Test validation of required configuration
   - Test default values

### Property-Based Testing

The system will use **fast-check** as the property-based testing library. Property-based tests will:

- Run a minimum of **100 iterations** per property test
- Generate random but valid test data (orders, products, webhooks)
- Verify universal properties hold across all inputs
- Each property test will be tagged with a comment referencing the design document

**Tag format**: `// Feature: moysklad-yandex-integration, Property {number}: {property_text}`

Example:
```javascript
// Feature: moysklad-yandex-integration, Property 2: Only mapped products are synchronized
test('only products with both externalCode and offerId_M2 are synchronized', () => {
  fc.assert(
    fc.property(fc.array(productGenerator()), (products) => {
      const result = filterMappedProducts(products);
      return result.every(p => p.externalCode && p.offerId_M2);
    }),
    { numRuns: 100 }
  );
});
```

### Integration Testing

Integration tests will verify:

1. **End-to-End Flows**
   - Stock sync flow: МойСклад webhook → M2 update
   - Order flow: M2 order → МойСклад customer order
   - Shipment flow: M2 shipped → МойСклад shipment

2. **API Integration**
   - Real API calls to staging environments
   - Webhook endpoint handling
   - Cron job execution

3. **File Operations**
   - Order mapping persistence
   - Concurrent access handling
   - File corruption recovery

### Test Coverage Goals

- Unit test coverage: >80% for business logic
- Property-based tests: All 32 correctness properties
- Integration tests: All critical flows (stock, order, shipment)

## Implementation Notes

### Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.x
- **HTTP Client**: Axios 1.x
- **Scheduler**: node-cron 2.x
- **Logging**: Winston 3.x
- **Testing**: Jest + fast-check
- **Storage**: File system (JSON)

### API Rate Limits

#### Яндекс.Маркет API
- Stock updates: 2000 products per request
- Order polling: Reasonable intervals (5-10 minutes)
- Respect rate limit headers in responses

#### МойСклад API
- Standard rate limits apply
- Implement exponential backoff for retries
- Batch operations where possible

### File Storage Format

Order mappings will be stored in JSON format:

```json
{
  "mappings": [
    {
      "m2OrderId": "12345",
      "moySkladOrderId": "uuid-here",
      "createdAt": "2024-01-01T12:00:00Z"
    }
  ]
}
```

File location: `./data/order-mappings.json`

### Security Considerations

1. **Credentials**: Store in environment variables, never in code or logs
2. **Webhook Validation**: Verify authenticity of МойСклад webhooks
3. **File Permissions**: Restrict access to order mapping file
4. **HTTPS**: Use HTTPS for all API communications
5. **Input Validation**: Validate all external data before processing

### Performance Considerations

1. **Batch Operations**: Update up to 2000 stocks per M2 API call
2. **Caching**: Cache SKU mappings in memory, refresh periodically
3. **Async Processing**: Use async/await for all I/O operations
4. **File Access**: Implement file locking for concurrent access
5. **Memory Management**: Stream large datasets instead of loading all at once

### Deployment

1. **Environment Variables**: Configure via `.env` file or container environment
2. **Process Management**: Use PM2 or similar for process supervision
3. **Monitoring**: Implement health check endpoint for monitoring
4. **Logging**: Configure log rotation and retention
5. **Backup**: Regular backups of order mapping file

