# Screenshot Batch Upload Feature

## Overview

Screenshots are now queued in batches of 5 and uploaded together to Supabase. This ensures:
- **No data loss** on network issues (screenshots stored locally until uploaded)
- **Efficient uploads** (batched uploads reduce API calls)
- **Local space management** (files deleted after successful upload)

## How It Works

### 1. Screenshot Capture Flow

1. Screenshot is captured (single or multiple displays)
2. Screenshot is compressed to JPEG
3. Screenshot is **saved locally** to the `screenshots/` directory
4. Screenshot is **added to batch queue** (not uploaded immediately)
5. Toast notification is shown to user

### 2. Batch Processing

The batch queue processes screenshots when:

- **Batch is full**: When 5 screenshots are queued, all 5 are uploaded immediately
- **Periodic flush**: If batch doesn't reach 5 screenshots, it's automatically flushed every 5 minutes
- **App close**: All remaining screenshots are flushed when app closes
- **Session end**: All remaining screenshots are flushed when background screenshots stop

### 3. Upload Process

When a batch is processed:

1. All screenshots in the batch are uploaded to Supabase Storage **in parallel**
2. Database records are inserted for each screenshot
3. Screenshot captured events are broadcast to the UI
4. **Local files are deleted** after successful upload
5. Failed uploads are **re-queued** for retry

### 4. Error Handling

- **Network errors**: Failed uploads remain in queue and are retried on next batch
- **Storage errors**: Screenshots stay local until upload succeeds
- **Cancelled screenshots**: Removed from queue and deleted locally

## Configuration

### Batch Size

Default batch size is **5 screenshots**. This can be changed by modifying:

```javascript
const SCREENSHOT_BATCH_SIZE = 5; // in main.js
```

### Flush Interval

If batch doesn't fill up, it's automatically flushed every **5 minutes**:

```javascript
const SCREENSHOT_BATCH_FLUSH_INTERVAL = 5 * 60 * 1000; // 5 minutes
```

## API Methods

### Check Batch Status

```javascript
const status = await window.electronAPI.getScreenshotBatchStatus();
console.log(status);
// {
//   queueSize: 3,           // Number of screenshots in queue
//   batchSize: 5,           // Target batch size
//   isUploading: false,     // Whether batch is currently uploading
//   nextFlushIn: 300000    // Milliseconds until next auto-flush
// }
```

### Manually Flush Batch

```javascript
await window.electronAPI.flushScreenshotBatch();
// Forces immediate upload of all queued screenshots
```

## Logging

The system logs detailed information about batch operations:

```
[BATCH-UPLOAD] Screenshot queued (1/5): /path/to/screenshot.jpg
[BATCH-UPLOAD] Screenshot queued (2/5): /path/to/screenshot2.jpg
...
[BATCH-UPLOAD] Batch full (5 screenshots), starting upload...
[BATCH-UPLOAD] Processing batch of 5 screenshot(s)
[BATCH-UPLOAD] Batch complete: 5/5 uploaded, 5 files deleted
```

## Benefits

### 1. Data Loss Prevention
- Screenshots are stored locally first
- Only deleted after successful upload
- Failed uploads are automatically retried

### 2. Network Efficiency
- Batched uploads reduce API calls
- Parallel uploads within batch
- Better handling of network interruptions

### 3. Local Storage Management
- Files deleted immediately after upload
- No accumulation of old screenshots
- Automatic cleanup on app close

### 4. User Experience
- Toast notifications still work (using local files)
- No delay in showing screenshots
- Background upload doesn't block UI

## File Naming

Screenshots are named with:
- User email (sanitized)
- Session ID
- Timestamp
- Screen index (for multi-monitor setups)

Example: `user_at_example_com_123_2025-11-21T08-05-41_screen1.jpg`

## Monitoring

To monitor batch operations, check the console logs for:
- `[BATCH-UPLOAD]` - Batch queue operations
- `[BG-UPLOAD]` - Background screenshot capture
- `[UPLOAD]` - Individual upload operations

## Troubleshooting

### Screenshots Not Uploading

1. Check batch status: `window.electronAPI.getScreenshotBatchStatus()`
2. Check console logs for errors
3. Manually flush: `window.electronAPI.flushScreenshotBatch()`
4. Verify Supabase connection

### Local Files Accumulating

1. Check if uploads are failing (check logs)
2. Verify network connection
3. Check Supabase storage permissions
4. Manually flush batch to force upload

### Batch Not Processing

1. Wait for batch to reach 5 screenshots, OR
2. Wait 5 minutes for auto-flush, OR
3. Manually flush: `window.electronAPI.flushScreenshotBatch()`

## Future Enhancements

Potential improvements:
- Configurable batch size per user/client
- Retry mechanism with exponential backoff
- Batch status indicator in UI
- Compression optimization per batch
- Priority queue for important screenshots

