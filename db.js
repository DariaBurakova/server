import sqlite3 from 'sqlite3'

const dbName = './videotek.db';

export const db = new sqlite3.Database(dbName, sqlite3.OPEN_READWRITE, (err) => {
  if (err && err.code === "SQLITE_CANTOPEN") {
    console.error("Ошибка сервера: нет базы данных");
  } else if (err) {
    console.error("Ошибка сервера – ошибка базы данных:");
    console.error(err);
  }
});
