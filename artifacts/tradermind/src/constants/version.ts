/**
 * ثوابت نسخه‌بندی TraderMind
 * نسخهٔ برنامه از package.json می‌آید؛ برای انتشار جدید فقط «version» همان فایل را تغییر دهید.
 *
 * APP_VERSION      — نسخه برنامه (Semantic Versioning: MAJOR.MINOR.PATCH)
 * DB_VERSION       — نسخه Schema پایگاه داده Dexie
 * BACKUP_FORMAT_VERSION — نسخه فرمت فایل‌های پشتیبان
 *
 * هنگام تغییر هر کدام از نسخه‌ها:
 *  - APP_VERSION:        پس از هر release قابل توجه افزایش پیدا می‌کند
 *  - DB_VERSION:         فقط با تغییر Schema پایگاه داده افزایش پیدا می‌کند
 *  - BACKUP_FORMAT_VERSION: فقط با تغییر ساختار فایل پشتیبان افزایش پیدا می‌کند
 */

import { version as packageVersion } from '../../package.json';

/**
 * نسخهٔ برنامه از package.json خوانده می‌شود تا همان عددی باشد که برای ساخت APK/EXE
 * استفاده می‌شود (پیش‌تر اینجا دستی «1.5.0» بود ولی package.json «2.0.0» بود).
 */
export const APP_VERSION: string = packageVersion;
export const DB_VERSION = 25;
export const BACKUP_FORMAT_VERSION = '3.2';
/** نسخه Schema برای فایل‌های پشتیبان */
export const SCHEMA_VERSION = 25;

/** نام کامل برنامه برای نمایش به کاربر */
export const APP_NAME = 'TraderMind';

/** نسخه کامل قابل نمایش */
export const DISPLAY_VERSION = `v${APP_VERSION}`;
