# Сторонние компоненты

Исходные уведомления и лицензии сохраняются в соответствующих пакетах и готовой Windows-сборке.

| Компонент | Использование | Лицензия / уведомление |
| --- | --- | --- |
| Node.js | Среда сервера | `runtime/NODE-LICENSE.txt` в Windows-сборке; [Node.js](https://github.com/nodejs/node/blob/main/LICENSE). |
| ws | WebSocket | MIT, `node_modules/ws/LICENSE`. |
| fflate | ZIP-пакеты SIQ | MIT, лицензия в `node_modules/fflate`. |
| fast-xml-parser | XML пакетов | MIT, лицензия в `node_modules/fast-xml-parser`. |
| VDO.Ninja SDK | Видеотрансляции | Mozilla Public License 2.0, [лицензия](public/vendor/VDONINJA-LICENSE.txt). SDK в `public/vendor/vdoninja-sdk.js` сохранён с исходными уведомлениями. |
| CryptoJS | Совместимость сигнализации с HTTP в локальной сети | MIT, [лицензия](public/vendor/CRYPTOJS-LICENSE.txt). |
| cloudflared | Необязательный туннель | `runtime/CLOUDFLARED-LICENSE.txt` в Windows-сборке; [cloudflared](https://github.com/cloudflare/cloudflared). |

Radmin VPN и VDO.Ninja используются как внешние средства подключения; проект не связан с их разработчиками. Пользовательские SIQ-пакеты и их медиа не входят в публичную поставку.
