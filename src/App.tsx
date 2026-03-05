import { useState, useRef, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Upload, FileText, Download, CheckCircle2, Loader2, Scissors, Move } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Set up pdf.js worker using a standard CDN URL that matches the installed version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

function App() {
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isComplete, setIsComplete] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pageCount, setPageCount] = useState(0);
    const [processedCount, setProcessedCount] = useState(0);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);

    // Cropping States (Percentages)
    const [splitPoint, setSplitPoint] = useState(48); // Horizontal split
    const [labelWidth, setLabelWidth] = useState(90); // Vertical cut for label
    const [labelLeft, setLabelLeft] = useState(5);   // Horizontal offset for label
    const [labelTopOffset, setLabelTopOffset] = useState(0); // Top cut for label

    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (file) {
            renderPreview();
        }
    }, [file]);

    const renderPreview = async () => {
        if (!file) return;
        setIsPreviewLoading(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);

            const viewport = page.getViewport({ scale: 1.0 });
            const canvas = canvasRef.current;
            if (!canvas) return;

            const context = canvas.getContext('2d');
            if (!context) return;

            // Calculate scale to fit container
            const containerWidth = 500; // Match CSS max-width
            const scale = containerWidth / viewport.width;
            const scaledViewport = page.getViewport({ scale });

            canvas.height = scaledViewport.height;
            canvas.width = scaledViewport.width;

            await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
        } catch (err) {
            console.error('Preview error:', err);
            setError('Failed to render PDF preview. You can still proceed with splitting.');
        } finally {
            setIsPreviewLoading(false);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files?.[0];
        if (droppedFile && droppedFile.type === 'application/pdf') {
            setFile(droppedFile);
            setIsComplete(false);
            setError(null);
        } else {
            setError('Please drop a valid PDF file.');
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile && selectedFile.type === 'application/pdf') {
            setFile(selectedFile);
            setIsComplete(false);
            setError(null);
        } else {
            setError('Please select a valid PDF file.');
        }
    };

    const processPdf = async () => {
        if (!file) return;
        setIsProcessing(true);
        setError(null);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const srcDoc = await PDFDocument.load(arrayBuffer);
            const labelDoc = await PDFDocument.create();
            const invoiceDoc = await PDFDocument.create();
            const pages = srcDoc.getPages();

            setPageCount(pages.length);
            setProcessedCount(0);

            for (let i = 0; i < pages.length; i++) {
                const srcPage = pages[i];
                const { width, height } = srcPage.getSize();

                // Calculate Y split (from bottom)
                const splitY = (height * (100 - splitPoint)) / 100;

                // Calculate Label horizontal cuts
                const lLeft = (width * labelLeft) / 100;
                const lWidth = (width * labelWidth) / 100;

                // Calculate Label top cut (from bottom)
                const lTopCut = (height * labelTopOffset) / 100;
                const finalLabelHeight = (height - splitY) - lTopCut;

                // Clone for Label
                const [labelPage] = await labelDoc.copyPages(srcDoc, [i]);
                // setCropBox(x, y, width, height)
                labelPage.setCropBox(lLeft, splitY, lWidth, finalLabelHeight);
                labelDoc.addPage(labelPage);

                // Clone for Invoice (usually full width bottom)
                const [invoicePage] = await invoiceDoc.copyPages(srcDoc, [i]);
                invoicePage.setCropBox(0, 0, width, splitY);
                invoicePage.setMediaBox(0, 0, width, splitY); // Set MediaBox for better accuracy
                invoiceDoc.addPage(invoicePage);

                // Update Label to set MediaBox too
                labelPage.setCropBox(lLeft, splitY, lWidth, finalLabelHeight);
                labelPage.setMediaBox(lLeft, splitY, lWidth, finalLabelHeight);

                setProcessedCount(i + 1);
                if (pages.length > 5) await new Promise(r => setTimeout(r, 0));
            }

            const labelBytes = await labelDoc.save();
            const invoiceBytes = await invoiceDoc.save();

            downloadFile(new Uint8Array(labelBytes), `labels_${file.name}`);
            downloadFile(new Uint8Array(invoiceBytes), `invoices_${file.name}`);

            setIsComplete(true);
        } catch (err) {
            console.error(err);
            setError('An error occurred while processing the PDF.');
        } finally {
            setIsProcessing(false);
        }
    };

    const downloadFile = (bytes: Uint8Array, fileName: string) => {
        const blob = new Blob([bytes as any], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 100);
    };

    return (
        <div className="glass-card" style={{ maxWidth: '900px' }}>
            <h1>Flipkart PDF Pro</h1>
            <p className="subtitle">Visual Splitting & Precision Cropping</p>

            {!file ? (
                <div
                    className={`upload-zone ${isDragging ? 'dragging' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept=".pdf"
                        style={{ display: 'none' }}
                    />
                    <Upload className="upload-icon" />
                    <h3>Select your Shipping PDF</h3>
                    <p>The PDF will be previewed for precise cropping</p>
                </div>
            ) : !isComplete ? (
                <div className="editor-layout">
                    <div className="split-preview-container">
                        {isPreviewLoading && (
                            <div className="preview-loader" style={{ position: 'absolute', zIndex: 30 }}>
                                <Loader2 className="animate-spin" size={48} color="white" />
                            </div>
                        )}

                        <div className="preview-wrapper" style={{ position: 'relative', display: 'inline-block' }}>
                            <canvas ref={canvasRef} className="pdf-canvas"></canvas>

                            {!isPreviewLoading && !error && (
                                <div className="preview-hint" style={{ position: 'absolute', bottom: '10px', right: '10px', fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', zIndex: 25 }}>
                                    Page 1 Preview
                                </div>
                            )}

                            <div className="crop-overlay">
                                {/* Horizontal Split Line */}
                                <div
                                    className="split-line-indicator"
                                    style={{ top: `${splitPoint}%` }}
                                ></div>

                                {/* Label Highlight Area (Green) */}
                                <div
                                    className="label-crop-box"
                                    style={{
                                        top: `${labelTopOffset}%`,
                                        left: `${labelLeft}%`,
                                        width: `${labelWidth}%`,
                                        height: `${splitPoint - labelTopOffset}%`
                                    }}
                                >
                                    <span className="preview-label" style={{ top: '10px' }}>Label Area</span>
                                </div>

                                {/* Invoice Highlight Area (Blue) */}
                                <div
                                    className="invoice-crop-box"
                                    style={{
                                        top: `${splitPoint}%`,
                                        left: '0',
                                        width: '100%',
                                        height: `${100 - splitPoint}%`
                                    }}
                                >
                                    <span className="preview-label" style={{ bottom: '10px' }}>Invoice Area</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="controls-grid">
                        <div className="control-group">
                            <label>Horizontal Split (Main)</label>
                            <input
                                type="range"
                                className="range-slider"
                                min="10" max="90"
                                value={splitPoint}
                                onChange={(e) => setSplitPoint(parseInt(e.target.value))}
                            />
                            <span style={{ fontSize: '0.8rem' }}>Line at {splitPoint}% from top</span>
                        </div>

                        <div className="control-group">
                            <label>Label Width (Vertical)</label>
                            <input
                                type="range"
                                className="range-slider"
                                min="20" max="100"
                                value={labelWidth}
                                onChange={(e) => setLabelWidth(parseInt(e.target.value))}
                            />
                            <span style={{ fontSize: '0.8rem' }}>{labelWidth}% width</span>
                        </div>

                        <div className="control-group">
                            <label>Label Left Offset</label>
                            <input
                                type="range"
                                className="range-slider"
                                min="0" max="50"
                                value={labelLeft}
                                onChange={(e) => setLabelLeft(parseInt(e.target.value))}
                            />
                            <span style={{ fontSize: '0.8rem' }}>{labelLeft}% from left</span>
                        </div>

                        <div className="control-group">
                            <label>Label Top Cut</label>
                            <input
                                type="range"
                                className="range-slider"
                                min="0" max="20"
                                value={labelTopOffset}
                                onChange={(e) => setLabelTopOffset(parseInt(e.target.value))}
                            />
                            <span style={{ fontSize: '0.8rem' }}>{labelTopOffset}% from top</span>
                        </div>

                        <div className="control-group" style={{ justifyContent: 'flex-end' }}>
                            <button
                                className="btn-primary"
                                onClick={processPdf}
                                disabled={isProcessing}
                                style={{ width: '100%' }}
                            >
                                {isProcessing ? (
                                    <><Loader2 className="animate-spin" /> Processing...</>
                                ) : (
                                    <><Scissors size={18} /> Split & Download</>
                                )}
                            </button>
                        </div>
                    </div>

                    {isProcessing && (
                        <div style={{ marginTop: '1rem' }}>
                            <div className="progress-bar">
                                <div
                                    className="progress-fill"
                                    style={{ width: `${(processedCount / pageCount) * 100}%` }}
                                ></div>
                            </div>
                        </div>
                    )}

                    <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                        <button
                            onClick={() => setFile(null)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.9rem' }}
                        >
                            Cancel & Change File
                        </button>
                    </div>
                </div>
            ) : (
                <div className="success-badge" style={{ flexDirection: 'column', gap: '1.5rem', padding: '4rem 0' }}>
                    <CheckCircle2 size={64} />
                    <div style={{ textAlign: 'center' }}>
                        <h2>Processing Complete!</h2>
                        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                            Generated {pageCount} pairs of documents.
                        </p>
                    </div>
                    <button
                        className="btn-primary"
                        onClick={() => { setFile(null); setIsComplete(false); }}
                    >
                        Start New Split
                    </button>
                </div>
            )}

            {error && <div className="error-msg" style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '8px', marginTop: '1rem', textAlign: 'center' }}>{error}</div>}

            <footer style={{ marginTop: '3rem', fontSize: '0.8rem', opacity: 0.5 }}>
                Flipkart Label Separator v2.0 • Edge Processing
            </footer>
        </div>
    );
}

export default App;
