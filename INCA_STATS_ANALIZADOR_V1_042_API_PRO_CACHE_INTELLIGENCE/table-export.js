(() => {
    'use strict';

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

    function text(selector, root = document, fallback = '') {
        return ($(selector, root)?.textContent || fallback).trim();
    }

    function numeroRoja(side) {
        const badge = $('.inca-red-card-badge', side);
        if (!badge) return 0;
        const multiplicador = text('b', badge).match(/\d+/)?.[0];
        return multiplicador ? Number(multiplicador) : 1;
    }

    function obtenerSrc(img) {
        if (!img) return '';
        return String(img.currentSrc || img.src || img.getAttribute('src') || '').trim();
    }

    function leerFilas(tbodyId) {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return [];

        return $$('tr.inca-visual-match-row', tbody).map((row) => {
            const equipos = $$('.inca-match-team span', row);
            const celdasEquipo = $$('.inca-match-team', row);
            const lados = $$('.inca-side-score', row);
            const rojaHome = $('.inca-red-slot--home', row);
            const rojaAway = $('.inca-red-slot--away', row);
            return {
                fecha: text('.inca-date-main', row, '—'),
                local: (equipos[0]?.textContent || '—').trim(),
                visita: (equipos[1]?.textContent || '—').trim(),
                logoLocal: obtenerSrc($('img', celdasEquipo[0])),
                logoVisita: obtenerSrc($('img', celdasEquipo[1])),
                valorLocal: text('.inca-score-number', lados[0], '0'),
                valorVisita: text('.inca-score-number', lados[1], '0'),
                rojaLocal: rojaHome ? numeroRoja(rojaHome) : (lados[0] ? numeroRoja(lados[0]) : 0),
                rojaVisita: rojaAway ? numeroRoja(rojaAway) : (lados[1] ? numeroRoja(lados[1]) : 0),
                acierto: row.classList.contains('row-hit')
            };
        });
    }

    const IMAGE_CACHE = new Map();
    let LOGO_INDEX_PROMISE = null;

    function normalizarEquipo(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/&/g, ' AND ')
            .replace(/\b(?:AFC|FC|CF|SC|AC|CD|UD|RC)\b/gi, ' ')
            .replace(/[^a-z0-9]+/gi, ' ')
            .trim()
            .toUpperCase();
    }

    async function cargarIndiceLogos() {
        if (LOGO_INDEX_PROMISE) return LOGO_INDEX_PROMISE;
        LOGO_INDEX_PROMISE = (async () => {
            try {
                await window.INCA_TITAN?.ensureReady?.();
                const teams = window.INCA_TITAN?.getCatalog?.()?.teams || [];
                const index = new Map();
                for (const team of teams) {
                    const url = window.INCA_TITAN?.logoUrl?.(team.name, team.team_id) || '';
                    if (url) index.set(normalizarEquipo(team.name), url);
                }
                return index;
            } catch (error) {
                console.warn('[INCA EXPORT] No se pudo construir índice TITAN de logos:', error);
                return new Map();
            }
        })();
        return LOGO_INDEX_PROMISE;
    }

    function buscarLogoPorEquipo(index, teamName) {
        const key = normalizarEquipo(teamName);
        if (!key) return '';
        if (index.has(key)) return index.get(key);
        for (const [candidate, url] of index.entries()) {
            if (candidate.length >= 5 && (candidate.includes(key) || key.includes(candidate))) return url;
        }
        return '';
    }

    function proxyImagen(url) {
        if (!/^https?:\/\//i.test(url || '')) return '';
        return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=256&h=256&fit=contain&output=png`;
    }

    async function cargarImagenConElemento(url) {
        return await new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.decoding = 'async';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    }

    async function cargarImagen(url) {
        if (!url) return null;
        if (IMAGE_CACHE.has(url)) return IMAGE_CACHE.get(url);

        const promise = (async () => {
            const candidates = [url];
            const proxied = proxyImagen(url);
            if (proxied) candidates.push(proxied);

            for (const candidate of candidates) {
                try {
                    const response = await fetch(candidate, { mode: 'cors', cache: 'force-cache' });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const blob = await response.blob();
                    if ('createImageBitmap' in window) return await createImageBitmap(blob);

                    const objectUrl = URL.createObjectURL(blob);
                    try {
                        return await cargarImagenConElemento(objectUrl);
                    } finally {
                        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
                    }
                } catch (_) {
                    try {
                        return await cargarImagenConElemento(candidate);
                    } catch (_) {}
                }
            }

            console.warn('[INCA EXPORT] No se pudo incorporar una imagen:', url);
            return null;
        })();

        IMAGE_CACHE.set(url, promise);
        return promise;
    }

    async function precargarImagenes(urls) {
        const unique = [...new Set(urls.filter(Boolean))];
        const entries = await Promise.all(unique.map(async (url) => [url, await cargarImagen(url)]));
        return new Map(entries);
    }

    function dibujarImagenContain(ctx, image, x, y, width, height, radius = 0) {
        if (!image) return false;
        const naturalWidth = image.naturalWidth || image.width || 1;
        const naturalHeight = image.naturalHeight || image.height || 1;
        const scale = Math.min(width / naturalWidth, height / naturalHeight);
        const drawWidth = naturalWidth * scale;
        const drawHeight = naturalHeight * scale;
        const drawX = x + (width - drawWidth) / 2;
        const drawY = y + (height - drawHeight) / 2;

        ctx.save();
        if (radius > 0) {
            roundedRect(ctx, x, y, width, height, radius);
            ctx.clip();
        }
        ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
        ctx.restore();
        return true;
    }

    function dibujarLogoFallback(ctx, x, y, size, initials, fill = '#0bbf83') {
        fillRounded(ctx, x, y, size, size, size / 2, fill);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 ${Math.max(11, Math.round(size * .32))}px Montserrat`;
        ctx.fillText(initials || 'IS', x + size / 2, y + size / 2 + 1);
    }

    function roundedRect(ctx, x, y, width, height, radius) {
        const r = Math.min(radius, width / 2, height / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + width, y, x + width, y + height, r);
        ctx.arcTo(x + width, y + height, x, y + height, r);
        ctx.arcTo(x, y + height, x, y, r);
        ctx.arcTo(x, y, x + width, y, r);
        ctx.closePath();
    }

    function fillRounded(ctx, x, y, width, height, radius, fill, stroke = null) {
        roundedRect(ctx, x, y, width, height, radius);
        ctx.fillStyle = fill;
        ctx.fill();
        if (stroke) {
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    function cortarTexto(ctx, value, maxWidth) {
        const original = String(value || '—');
        if (ctx.measureText(original).width <= maxWidth) return original;
        let result = original;
        while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
            result = result.slice(0, -1);
        }
        return `${result}…`;
    }

    function dibujarTarjetaRoja(ctx, x, centerY, count) {
        if (!count) return 0;
        const width = 9;
        const height = 14;
        ctx.save();
        ctx.translate(x, centerY - height / 2);
        ctx.rotate(2 * Math.PI / 180);
        fillRounded(ctx, 0, 0, width, height, 2, '#ef3340');
        ctx.restore();
        if (count > 1) {
            ctx.fillStyle = '#991b1b';
            ctx.font = '700 10px Montserrat';
            ctx.textAlign = 'left';
            ctx.fillText(`×${count}`, x + 12, centerY + 4);
            return 28;
        }
        return 13;
    }

    function dibujarMarcador(ctx, x, centerY, row) {
        const boxWidth = 126;
        const boxHeight = 30;
        fillRounded(ctx, x - boxWidth / 2, centerY - boxHeight / 2, boxWidth, boxHeight, 9, '#ffffff', '#b8dfcf');

        ctx.font = '800 15px Montserrat';
        ctx.fillStyle = '#152238';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const leftX = x - 31;
        const rightX = x + 31;
        ctx.fillText(row.valorLocal, leftX, centerY);
        ctx.fillStyle = '#718096';
        ctx.fillText('–', x, centerY);
        ctx.fillStyle = '#152238';
        ctx.fillText(row.valorVisita, rightX, centerY);

        if (row.rojaLocal) dibujarTarjetaRoja(ctx, leftX + 13, centerY, row.rojaLocal);
        if (row.rojaVisita) dibujarTarjetaRoja(ctx, rightX + 14, centerY, row.rojaVisita);
    }

    function dibujarPanel(ctx, config) {
        const { x, y, width, rows, title, subtitle, accent, images } = config;
        const headerHeight = 72;
        const columnHeight = 42;
        const rowHeight = 46;
        const height = headerHeight + columnHeight + Math.max(rows.length, 1) * rowHeight;

        ctx.save();
        ctx.shadowColor = 'rgba(15, 23, 42, .08)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 6;
        fillRounded(ctx, x, y, width, height, 18, '#ffffff', '#dce8e3');
        ctx.restore();

        fillRounded(ctx, x, y, width, headerHeight, 18, '#f7fbf9');
        ctx.fillStyle = accent;
        ctx.fillRect(x, y + headerHeight - 4, width, 4);

        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#172033';
        ctx.font = '800 18px Montserrat';
        ctx.fillText(title, x + 24, y + 31);
        ctx.fillStyle = '#708197';
        ctx.font = '600 12px Montserrat';
        ctx.fillText(cortarTexto(ctx, subtitle, width - 100), x + 24, y + 52);

        fillRounded(ctx, x + width - 62, y + 19, 38, 30, 10, '#ffffff', '#cfe7dc');
        ctx.fillStyle = accent;
        ctx.textAlign = 'center';
        ctx.font = '800 13px Montserrat';
        ctx.fillText(String(rows.length), x + width - 43, y + 39);

        const columnsY = y + headerHeight;
        ctx.fillStyle = '#eef5f2';
        ctx.fillRect(x, columnsY, width, columnHeight);
        ctx.fillStyle = '#66768b';
        ctx.font = '800 10px Montserrat';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText('FECHA', x + 18, columnsY + columnHeight / 2);
        ctx.fillText('LOCAL', x + 122, columnsY + columnHeight / 2);
        ctx.textAlign = 'center';
        ctx.fillText('MARCADOR', x + width / 2, columnsY + columnHeight / 2);
        ctx.textAlign = 'right';
        ctx.fillText('VISITANTE', x + width - 18, columnsY + columnHeight / 2);

        if (!rows.length) {
            ctx.fillStyle = '#8a99aa';
            ctx.font = '700 13px Montserrat';
            ctx.textAlign = 'center';
            ctx.fillText('SIN REGISTROS', x + width / 2, columnsY + columnHeight + rowHeight / 2);
            return height;
        }

        rows.forEach((row, index) => {
            const rowY = columnsY + columnHeight + index * rowHeight;
            ctx.fillStyle = row.acierto ? '#e9f8d5' : '#fde4e4';
            ctx.fillRect(x + 1, rowY, width - 2, rowHeight);
            ctx.strokeStyle = '#e1ebe6';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 1, rowY + rowHeight);
            ctx.lineTo(x + width - 1, rowY + rowHeight);
            ctx.stroke();

            const centerY = rowY + rowHeight / 2;
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#172033';
            ctx.font = '700 11px Montserrat';
            ctx.textAlign = 'left';
            ctx.fillText(row.fecha, x + 18, centerY);

            const logoSize = 25;
            const localLogoX = x + 116;
            const visitanteLogoX = x + width - 45;
            const localImage = images?.get(row.logoLocal);
            const visitanteImage = images?.get(row.logoVisita);

            if (localImage) {
                dibujarImagenContain(ctx, localImage, localLogoX, centerY - logoSize / 2, logoSize, logoSize);
            }

            ctx.font = '700 11px Montserrat';
            ctx.fillStyle = '#172033';
            ctx.textAlign = 'left';
            const localTextX = localImage ? x + 149 : x + 116;
            const localTextMax = localImage ? 155 : 188;
            ctx.fillText(cortarTexto(ctx, row.local, localTextMax), localTextX, centerY);

            if (visitanteImage) {
                dibujarImagenContain(ctx, visitanteImage, visitanteLogoX, centerY - logoSize / 2, logoSize, logoSize);
            }

            ctx.fillStyle = '#172033';
            ctx.textAlign = 'right';
            const visitanteTextX = visitanteImage ? visitanteLogoX - 8 : x + width - 18;
            const visitanteTextMax = visitanteImage ? 155 : 188;
            ctx.fillText(cortarTexto(ctx, row.visita, visitanteTextMax), visitanteTextX, centerY);

            dibujarMarcador(ctx, x + width / 2, centerY, row);
        });

        return height;
    }

    function descargarCanvas(canvas, filename) {
        canvas.toBlob((blob) => {
            if (!blob) throw new Error('No se pudo generar la imagen.');
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1500);
        }, 'image/png', 1);
    }

    function nombreSeguro(value) {
        return String(value || 'reporte')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/gi, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 80);
    }

    async function exportarTablasComoImagen() {
        const button = document.getElementById('btnExportarTablasPng');
        const homeRows = leerFilas('tablaResultadosHome');
        const awayRows = leerFilas('tablaResultadosAway');

        if (!homeRows.length && !awayRows.length) {
            window.alert('Primero selecciona un equipo y espera a que carguen las tablas.');
            return;
        }

        const original = button?.innerHTML;
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> GENERANDO IMAGEN';
        }

        try {
            await document.fonts?.ready;

            const logoIndex = await cargarIndiceLogos();
            for (const row of [...homeRows, ...awayRows]) {
                if (!row.logoLocal || row.logoLocal.startsWith('data:image/svg+xml')) {
                    row.logoLocal = buscarLogoPorEquipo(logoIndex, row.local) || row.logoLocal;
                }
                if (!row.logoVisita || row.logoVisita.startsWith('data:image/svg+xml')) {
                    row.logoVisita = buscarLogoPorEquipo(logoIndex, row.visita) || row.logoVisita;
                }
            }

            const brandLogoUrl = obtenerSrc($('.brand-logo')) || obtenerSrc($('.portal-brand img'));
            const selectedTeamLogoUrl = obtenerSrc($('#logoEquipoMain')) || obtenerSrc($('#visualTeamLogo')) || buscarLogoPorEquipo(logoIndex, text('#selectEquipo option:checked', document, ''));
            const imageUrls = [
                brandLogoUrl,
                selectedTeamLogoUrl,
                ...homeRows.flatMap((row) => [row.logoLocal, row.logoVisita]),
                ...awayRows.flatMap((row) => [row.logoLocal, row.logoVisita])
            ];
            const images = await precargarImagenes(imageUrls);

            const width = 1800;
            const margin = 70;
            const gap = 38;
            const panelWidth = (width - margin * 2 - gap) / 2;
            const maxRows = Math.max(homeRows.length, awayRows.length, 1);
            const headerHeight = 226;
            const panelHeight = 72 + 42 + maxRows * 46;
            const footerHeight = 76;
            const height = headerHeight + panelHeight + footerHeight + margin;
            const scale = Math.min(2, window.devicePixelRatio || 1.5);

            const canvas = document.createElement('canvas');
            canvas.width = Math.round(width * scale);
            canvas.height = Math.round(height * scale);
            const ctx = canvas.getContext('2d');
            ctx.scale(scale, scale);

            ctx.fillStyle = '#f5f8f7';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, 178);
            ctx.fillStyle = '#0bbf83';
            ctx.fillRect(0, 174, width, 4);

            fillRounded(ctx, margin, 43, 74, 74, 37, '#ffffff', '#cfe7dc');
            const brandImage = images.get(brandLogoUrl);
            if (brandImage) {
                dibujarImagenContain(ctx, brandImage, margin + 5, 48, 64, 64, 32);
            } else {
                dibujarLogoFallback(ctx, margin, 43, 74, 'IS');
            }

            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#0d1729';
            ctx.font = '900 34px Montserrat';
            ctx.fillText('INCA STATS PREMIUM', margin + 96, 72);
            ctx.fillStyle = '#0a9f6e';
            ctx.font = '800 13px Montserrat';
            ctx.fillText('REPORTE ESTADÍSTICO · TEMPORADA ACTUAL', margin + 98, 100);

            const market = text('#tituloMercado', document, 'ANÁLISIS');
            const subtitle = text('#subtituloFiltros', document, 'REPORTE DE PARTIDOS');
            const selectedTeamImage = images.get(selectedTeamLogoUrl);
            const marketTextX = selectedTeamImage ? margin + 58 : margin;
            if (selectedTeamImage) {
                fillRounded(ctx, margin, 184, 46, 46, 12, '#ffffff', '#d6e8e0');
                dibujarImagenContain(ctx, selectedTeamImage, margin + 5, 189, 36, 36);
            }
            ctx.fillStyle = '#172033';
            ctx.font = '900 27px Montserrat';
            ctx.fillText(market, marketTextX, 207);
            ctx.fillStyle = '#64748b';
            ctx.font = '700 14px Montserrat';
            ctx.fillText(cortarTexto(ctx, subtitle, width - marketTextX - margin), marketTextX, 232);

            const now = new Date();
            ctx.textAlign = 'right';
            ctx.fillStyle = '#7b899c';
            ctx.font = '700 12px Montserrat';
            ctx.fillText(`GENERADO: ${now.toLocaleDateString('es-PE')} · ${now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`, width - margin, 72);

            const panelY = headerHeight + 30;
            dibujarPanel(ctx, {
                x: margin,
                y: panelY,
                width: panelWidth,
                rows: homeRows,
                title: text('#visualHomeTitle', document, 'HOME'),
                subtitle: text('#visualHomeSubtitle', document, 'Historial como local'),
                accent: '#0bbf83',
                images
            });
            dibujarPanel(ctx, {
                x: margin + panelWidth + gap,
                y: panelY,
                width: panelWidth,
                rows: awayRows,
                title: text('#visualAwayTitle', document, 'AWAY'),
                subtitle: text('#visualAwaySubtitle', document, 'Historial como visitante'),
                accent: '#f59e0b',
                images
            });

            const footerY = height - footerHeight;
            ctx.fillStyle = '#0d1729';
            ctx.fillRect(0, footerY, width, footerHeight);
            ctx.textAlign = 'left';
            ctx.fillStyle = '#ffffff';
            ctx.font = '800 13px Montserrat';
            ctx.fillText('INCA STATS PREMIUM', margin, footerY + 31);
            ctx.fillStyle = '#9fb0c3';
            ctx.font = '600 11px Montserrat';
            ctx.fillText('Las tendencias estadísticas no garantizan resultados futuros.', margin, footerY + 52);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#49d8a5';
            ctx.font = '800 11px Montserrat';
            ctx.fillText('ANÁLISIS CON DATOS · TEMPORADA ACTIVA', width - margin, footerY + 42);

            const equipo = text('#selectEquipo option:checked', document, 'equipo');
            descargarCanvas(canvas, `INCA_STATS_PREMIUM_${nombreSeguro(equipo)}_${nombreSeguro(market)}.png`);
        } catch (error) {
            console.error('[INCA EXPORT]', error);
            window.alert('No se pudo generar la imagen. Revisa la consola e inténtalo nuevamente.');
        } finally {
            if (button) {
                button.disabled = false;
                button.innerHTML = original;
            }
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('btnExportarTablasPng')?.addEventListener('click', exportarTablasComoImagen);
    });

    window.exportarTablasComoImagen = exportarTablasComoImagen;
})();
