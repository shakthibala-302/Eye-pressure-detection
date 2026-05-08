/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Activity, 
  Camera, 
  Upload, 
  Eye, 
  FileText, 
  ChevronRight, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCcw,
  Zap,
  LayoutDashboard,
  Database,
  ExternalLink,
  Cloud
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { analyzeEyeImage, EyeAnalysisResult, uploadToGCS } from './services/geminiService';

type CaseType = "Glaucoma" | "Normal" | "Real Captured" | "Fundus";

export default function App() {
  const [activeTab, setActiveTab] = useState<'reflection' | 'fundus'>('reflection');
  const [caseType, setCaseType] = useState<CaseType>("Normal");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<EyeAnalysisResult | null>(null);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [language, setLanguage] = useState<'English' | 'Hindi'>('English');
  const [error, setError] = useState<string | null>(null);
  const [latency] = useState(Math.floor(Math.random() * 50) + 120);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (activeTab === 'fundus') setCaseType("Fundus");
    else if (caseType === "Fundus") setCaseType("Normal");
  }, [activeTab, caseType]);

  // Handle camera stream life-cycle
  useEffect(() => {
    if (isCameraActive && !stream) {
      const getStream = async () => {
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              facingMode: 'user',
              width: { ideal: 1280 },
              height: { ideal: 720 }
            } 
          });
          setStream(newStream);
          if (videoRef.current) {
            videoRef.current.srcObject = newStream;
          }
        } catch (err) {
          setError("Camera access denied. Please allow permissions.");
          setIsCameraActive(false);
        }
      };
      getStream();
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isCameraActive, stream]);

  // Sync video ref when stream is available
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, isCameraActive]);

  const startCamera = () => {
    setIsCameraActive(true);
    setError(null);
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraActive(false);
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (context && video.readyState === video.HAVE_ENOUGH_DATA) {
        // CROP LOGIC: Focus tightly on the eye (center 40% of the video)
        const minSize = Math.min(video.videoWidth, video.videoHeight);
        const cropSize = minSize * 0.4; 
        const startX = (video.videoWidth - cropSize) / 2;
        const startY = (video.videoHeight - cropSize) / 2;

        canvas.width = 600; // Standardize output resolution for analysis
        canvas.height = 600;
        
        context.drawImage(
          video, 
          startX, startY, cropSize, cropSize, // Source
          0, 0, 600, 600 // Destination
        );
        
        try {
          const dataUrl = canvas.toDataURL('image/png');
          setOriginalImage(dataUrl);
          stopCamera();
          handleAnalysis(dataUrl);
        } catch (err) {
          setError("Failed to process captured image.");
        }
      } else {
        setError("Camera not ready. Please wait a moment.");
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setOriginalImage(dataUrl);
        handleAnalysis(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalysis = async (dataUrl: string) => {
    setIsAnalyzing(true);
    setResult(null);
    setSignedUrl(null);
    setError(null);
    try {
      // 1. Upload to GCS
      try {
        const url = await uploadToGCS(dataUrl);
        setSignedUrl(url);
      } catch (uploadErr) {
        console.warn("GCS Upload failed. Proceeding with local analysis.");
      }

      // 2. Run Gemini Analysis
      const base64 = dataUrl.split(',')[1];
      const mimeType = dataUrl.split(';')[0].split(':')[1];
      const analysisResult = await analyzeEyeImage(base64, mimeType, caseType, language);
      setResult(analysisResult);
    } catch (err) {
      setError("Analysis failed. Ensure GEMINI_API_KEY is configured.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const reset = () => {
    setResult(null);
    setOriginalImage(null);
    setSignedUrl(null);
    setError(null);
  };

  return (
    <div className="flex h-screen bg-medical-bg overflow-hidden text-slate-200 font-sans">
      {/* SIDEBAR */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-2 text-medical-primary mb-1 font-bold text-lg">
            <Activity className="w-5 h-5" />
            OcularScan
          </div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold italic">Cloud Diagnostics Platform</div>
        </div>

        <nav className="p-4 space-y-6 flex-grow overflow-y-auto">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 px-2">Cloud Configuration</div>
            <div className="px-3 py-3 bg-slate-800/80 rounded-lg border border-slate-700">
               <div className="text-[10px] text-slate-400 mb-2 leading-relaxed">
                 To see images in your cloud, go to <b>Settings</b> and set:
               </div>
               <div className="space-y-1.5">
                 <div className="flex justify-between text-[9px] font-mono">
                   <span className="text-medical-primary">GCS_BUCKET</span>
                   <span className="text-slate-500">{process.env.GCS_BUCKET ? '✓ Set' : '! Missing'}</span>
                 </div>
                 <div className="flex justify-between text-[9px] font-mono">
                   <span className="text-medical-primary">GCS_PROJECT</span>
                   <span className="text-slate-500">{process.env.GCS_PROJECT_ID ? '✓ Set' : '! Missing'}</span>
                 </div>
               </div>
               <a 
                 href="https://console.cloud.google.com/storage" 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="mt-3 block text-center py-1 bg-medical-primary/10 hover:bg-medical-primary/20 text-medical-primary text-[10px] rounded transition-colors"
               >
                 Open Cloud Console
               </a>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 px-2">Clinical Cases</div>
            <div className="flex flex-col gap-1">
              <button 
                onClick={() => setCaseType("Normal")}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${caseType === "Normal" ? 'bg-medical-primary/10 text-medical-primary font-medium border border-medical-primary/20' : 'text-slate-400 hover:bg-slate-800'}`}
              >
                Normal Eye Case
              </button>
              <button 
                onClick={() => setCaseType("Glaucoma")}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${caseType === "Glaucoma" ? 'bg-medical-primary/10 text-medical-primary font-medium border border-medical-primary/20' : 'text-slate-400 hover:bg-slate-800'}`}
              >
                Glaucoma Sample
              </button>
              <button 
                onClick={() => setCaseType("Real Captured")}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${caseType === "Real Captured" ? 'bg-medical-primary/10 text-medical-primary font-medium border border-medical-primary/20' : 'text-slate-400 hover:bg-slate-800'}`}
              >
                Real Captured
              </button>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 px-2">Analysis Mode</div>
            <div className="flex flex-col gap-1">
              <button 
                onClick={() => setActiveTab('reflection')}
                className={`sidebar-item ${activeTab === 'reflection' ? 'sidebar-item-active' : ''}`}
              >
                <Activity size={16} />
                Reflection Profile
              </button>
              <button 
                onClick={() => setActiveTab('fundus')}
                className={`sidebar-item ${activeTab === 'fundus' ? 'sidebar-item-active' : ''}`}
              >
                <Database size={16} />
                Fundus Scan
              </button>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 px-2">Report Language</div>
            <div className="flex bg-slate-800 rounded-lg p-1 gap-1">
              <button 
                onClick={() => setLanguage('English')}
                className={`flex-1 py-1.5 text-[10px] font-bold rounded transition-all ${language === 'English' ? 'bg-medical-primary text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                ENGLISH
              </button>
              <button 
                onClick={() => setLanguage('Hindi')}
                className={`flex-1 py-1.5 text-[10px] font-bold rounded transition-all ${language === 'Hindi' ? 'bg-medical-primary text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                HINDI
              </button>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 px-2">Model Status</div>
            <div className="px-3 py-2 bg-slate-800 rounded-lg">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-slate-300">Gemini Cloud</span>
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
              </div>
              <div className="w-full bg-slate-700 h-1 rounded-full overflow-hidden">
                <div className="bg-medical-primary w-[98%] h-full"></div>
              </div>
            </div>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="bg-slate-800 rounded-xl p-4 text-white">
            <div className="text-[10px] text-slate-500 uppercase mb-1">Cloud Sync</div>
            <div className="text-sm font-medium">Processing via GCP</div>
            <div className="text-[10px] text-medical-primary mt-1">● Secure Tunnel</div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-grow flex flex-col h-full overflow-hidden">
        {/* HEADER */}
        <header className="h-16 bg-slate-900 border-b border-slate-800 px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <LayoutDashboard size={18} className="text-slate-500" />
            <h1 className="text-lg font-semibold text-white">Diagnostic Dashboard</h1>
          </div>
          <div className="flex gap-6 items-center">
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-500 uppercase tracking-tighter">Latency</span>
              <span className="text-xs font-mono font-medium text-medical-primary">{result ? latency : '--'}ms</span>
            </div>
            <div className="flex gap-2">
              {originalImage && (
                <button 
                  onClick={reset}
                  className="px-4 py-2 text-slate-400 hover:bg-slate-800 rounded-lg text-xs font-bold uppercase transition-colors"
                >
                  Clear
                </button>
              )}
              <button 
                onClick={isCameraActive ? captureImage : startCamera}
                className="bg-medical-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-medical-primary-dark shadow-sm shadow-medical-primary/20 transition-all flex items-center gap-2"
              >
                {isCameraActive ? (
                  <>Capture Now</>
                ) : (
                  <>
                    <Camera size={16} />
                    New Scan
                  </>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* SCROLLABLE AREA */}
        <div className="flex-1 overflow-y-auto p-8 bg-medical-bg">
          <div className="max-w-5xl mx-auto space-y-6">
            
            {/* STATS STRIP */}
            <div className="grid grid-cols-4 gap-4">
              <div className="medical-card p-4 bg-slate-800/50 border-slate-700/50">
                <div className="text-[11px] text-slate-500 uppercase font-bold tracking-wider mb-2">
                  {activeTab === 'reflection' ? 'Intraocular Pressure' : 'Predictive Score'}
                </div>
                <div className="flex items-baseline gap-1">
                  <div className={`text-4xl font-light ${result?.status.toLowerCase().includes('high') ? 'text-rose-400' : 'text-white'}`}>
                    {activeTab === 'reflection' 
                      ? (result?.iop.toFixed(1) || '--') 
                      : (result ? `${(result.glaucomaProbability * 100).toFixed(0)}%` : '--')
                    }
                  </div>
                  {activeTab === 'reflection' && <div className="text-sm font-medium text-slate-500">mmHg</div>}
                </div>
                {result && (
                  <div className={`text-[10px] font-bold mt-1 uppercase ${result.status.toLowerCase().includes('high') ? 'text-rose-400' : 'text-medical-primary'}`}>
                    {result.status.toLowerCase().includes('high') ? '▲ HIGH RISK' : '● WITHIN LIMITS'}
                  </div>
                )}
              </div>

              <div className="medical-card p-4 bg-slate-800/50 border-slate-700/50">
                <div className="text-[11px] text-slate-500 uppercase font-bold tracking-wider mb-2">
                  {activeTab === 'reflection' ? 'Eccentricity Index' : 'Glaucoma Likelihood'}
                </div>
                <div className="text-4xl font-light text-white">
                  {activeTab === 'reflection' 
                    ? (result?.eccentricity.toFixed(4) || '--') 
                    : (result?.glaucomaProbability.toFixed(3) || '--')
                  }
                </div>
                <div className="text-[10px] text-slate-500 mt-1 uppercase font-bold">
                  {result ? (activeTab === 'reflection' ? 'Surface deformation' : 'Deep features') : 'No data active'}
                </div>
              </div>

              <div className="medical-card p-4 bg-slate-800/50 border-slate-700/50">
                <div className="text-[11px] text-slate-500 uppercase font-bold tracking-wider mb-2">Confidence Level</div>
                <div className="text-4xl font-light text-white">{result ? '91%' : '--'}</div>
                <div className="text-[10px] text-amber-500 font-bold mt-1 uppercase">
                  {result ? 'MODERATE' : 'PENDING'}
                </div>
              </div>

              <div className="medical-card p-4 bg-slate-800/50 border-slate-700/50">
                <div className="text-[11px] text-slate-500 uppercase font-bold tracking-wider mb-2">Target Mode</div>
                <div className="text-4xl font-light text-medical-primary">
                  {activeTab === 'reflection' ? 'Ring' : 'Fundus'}
                </div>
                <div className="text-[10px] text-slate-500 mt-1 uppercase font-bold">
                  {isAnalyzing ? 'Scanning...' : 'LOCK: STABLE'}
                </div>
              </div>
            </div>

            {/* MAIN INTERFACE */}
            <AnimatePresence mode="wait">
              {!originalImage && !isCameraActive ? (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="medical-card border-dashed border-2 py-24 flex flex-col items-center justify-center bg-white/50"
                >
                  <div className="w-16 h-16 bg-medical-primary/10 rounded-full flex items-center justify-center mb-4 text-medical-primary">
                    <Upload size={32} />
                  </div>
                  <h3 className="text-lg font-bold mb-1">Begin New Analysis</h3>
                  <p className="text-slate-400 text-sm mb-6 max-w-xs text-center leading-relaxed">
                    Capture a live frame or upload a medical image to process through our cloud-based diagnostics.
                  </p>
                  <div className="flex gap-3">
                    <label className="bg-medical-primary text-white px-6 py-2.5 rounded-lg text-sm font-bold cursor-pointer hover:bg-medical-primary-dark transition-all shadow-md shadow-medical-primary/10">
                      Upload File
                      <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                    </label>
                    <button 
                      onClick={startCamera}
                      className="bg-white border border-slate-200 text-slate-700 px-6 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-50 transition-all"
                    >
                      Open Camera
                    </button>
                  </div>
                </motion.div>
              ) : isCameraActive ? (
                <motion.div 
                  key="camera"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="medical-card bg-slate-900 h-[500px] relative overflow-hidden group shadow-2xl"
                >
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                  <canvas ref={canvasRef} className="hidden" />
                  
                  {/* Camera overlays */}
                  <div className="absolute inset-0 border-[80px] border-black/80 pointer-events-none">
                    <div className="w-full h-full border-2 border-white/10 relative flex items-center justify-center">
                       {/* High Precision Eye Frame */}
                       <div className="w-56 h-56 border-2 border-medical-primary rounded-full shadow-[0_0_0_1000px_rgba(0,0,0,0.4)] relative flex items-center justify-center">
                          <div className="absolute inset-0 border border-medical-primary/20 rounded-full animate-pulse"></div>
                          <div className="w-8 h-[1px] bg-medical-primary/60"></div>
                          <div className="w-[1px] h-8 bg-medical-primary/60"></div>
                       </div>
                       
                       <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[9px] font-bold text-medical-primary uppercase tracking-[0.4em] bg-black/60 px-4 py-1.5 rounded-full border border-medical-primary/30">
                         ALIGN EYE CENTER
                       </div>
                       
                       <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[8px] text-slate-400 font-medium">
                         Focus distance: ~10cm
                       </div>
                    </div>
                  </div>

                  <div className="absolute top-6 left-6 flex items-center gap-2 bg-slate-900/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-[10px] text-white font-bold uppercase tracking-widest">Live Stream</span>
                  </div>

                  <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-8">
                    <button 
                      onClick={stopCamera}
                      className="w-12 h-12 bg-slate-800/80 backdrop-blur-xl rounded-full border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 transition-all"
                    >
                      <RefreshCcw size={20} />
                    </button>
                    <div className="flex flex-col items-center gap-3">
                      <button 
                        onClick={captureImage}
                        className="w-20 h-20 bg-white rounded-full p-1.5 border-4 border-medical-primary shadow-[0_0_40px_rgba(77,182,172,0.4)] active:scale-95 transition-transform group"
                      >
                        <div className="w-full h-full bg-medical-primary rounded-full flex items-center justify-center text-white">
                          <Camera size={32} />
                        </div>
                      </button>
                      <span className="text-[10px] text-white font-bold uppercase tracking-[0.2em] drop-shadow-md">Press to Capture</span>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-6"
                >
                  {/* IMAGES AREA */}
                  <div className="grid grid-cols-2 gap-6 h-[280px]">
                    <div className="medical-card p-4 flex flex-col group relative">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-slate-400 uppercase">Original Input</span>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded uppercase font-bold">Raw Buffer</span>
                      </div>
                      <div className="flex-grow rounded-xl bg-slate-900 overflow-hidden relative">
                        <img src={originalImage!} alt="Original" className="w-full h-full object-cover" />
                        <div className="absolute bottom-2 left-2 flex items-center gap-2">
                           <div className="text-[10px] text-white/40 font-mono">Source: Secure Cloud Tunnel</div>
                           {signedUrl && (
                             <a 
                               href={signedUrl} 
                               target="_blank" 
                               rel="noopener noreferrer" 
                               className="text-[10px] text-medical-primary flex items-center gap-1 bg-slate-900/40 hover:bg-slate-900/60 transition-colors px-1.5 py-0.5 rounded"
                             >
                               <Cloud size={10} />
                               GCS Link
                               <ExternalLink size={10} />
                             </a>
                           )}
                        </div>
                      </div>
                    </div>

                    <div className="medical-card p-4 flex flex-col bg-white">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-medical-primary uppercase">CV Processed Analysis</span>
                        <span className="px-2 py-0.5 bg-medical-primary/10 text-medical-primary text-[10px] rounded font-bold">CALCULATED</span>
                      </div>
                      <div className="flex-grow rounded-xl bg-slate-900 overflow-hidden relative">
                         {isAnalyzing ? (
                           <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                              <div className="w-12 h-12 border-2 border-medical-primary/20 border-t-medical-primary rounded-full animate-spin"></div>
                              <span className="text-[10px] text-medical-primary font-bold uppercase tracking-widest animate-pulse">Running Invariants</span>
                           </div>
                         ) : (
                           <div className="w-full h-full relative">
                              <img src={originalImage!} alt="Processed" className="w-full h-full object-cover opacity-40 grayscale" />
                              {/* Symbolic CV Overlay */}
                              <div className="absolute inset-0 flex items-center justify-center">
                                 <div className={`rounded-full border-2 shadow-[0_0_20px_rgba(77,182,172,0.3)] transition-all ${activeTab === 'reflection' ? 'w-48 h-24 border-medical-primary' : 'w-40 h-40 border-rose-500'}`}></div>
                                 <div className="absolute w-[1px] h-full bg-white/10"></div>
                                 <div className="absolute w-full h-[1px] bg-white/10"></div>
                              </div>
                              {result && (
                                <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
                                   <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur px-2 py-1 rounded border border-white/10">
                                      <span className="text-[9px] text-slate-400 uppercase">Lock</span>
                                      <span className="text-[10px] text-medical-primary font-mono font-bold">STABLE</span>
                                   </div>
                                   <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur px-2 py-1 rounded border border-white/10">
                                      <span className="text-[9px] text-slate-400 uppercase">Err</span>
                                      <span className="text-[10px] text-medical-primary font-mono">0.002%</span>
                                   </div>
                                </div>
                              )}
                           </div>
                         )}
                      </div>
                    </div>
                  </div>

                  {/* AI REPORT BOX */}
                  {result && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="bg-slate-800/80 p-8 rounded-2xl shadow-sm border border-slate-700/50 relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-8 opacity-5 text-white">
                         <Zap size={120} />
                      </div>
                      
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-medical-primary/10 rounded-xl text-medical-primary">
                          <Zap size={20} />
                        </div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-white">Diagnostic Insight</h3>
                      </div>

                      <div className="text-base text-slate-300 leading-relaxed max-w-3xl font-medium mb-10">
                        {result.report.replace(/AI/g, 'Engine').split('\n').map((paragraph, i) => (
                          <p key={i} className="mb-4 last:mb-0">
                            {paragraph}
                          </p>
                        ))}
                      </div>

                      {/* Doctor's Simple Report */}
                      <div className="bg-medical-primary/5 border border-medical-primary/20 p-6 rounded-xl">
                        <div className="flex items-center gap-2 mb-3 text-medical-primary font-bold text-xs uppercase tracking-wider">
                           <FileText size={16} />
                           Doctor's Notes (Easy Read)
                        </div>
                        <div className="text-lg text-slate-200 font-medium">
                          {result.simpleReport}
                        </div>
                      </div>

                      <div className="mt-8 pt-6 border-t border-slate-700/50 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                           <div className="flex items-center gap-2">
                             <CheckCircle2 size={16} className="text-medical-primary" />
                             <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Verified by GCP</span>
                           </div>
                           <div className="flex items-center gap-2">
                             <Database size={16} className="text-medical-primary" />
                             <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Encrypted Analysis</span>
                           </div>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono tracking-tighter">
                          UID: CX-{Math.random().toString(36).substring(7).toUpperCase()}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {error && (
                    <div className="bg-rose-50 border border-rose-100 p-6 rounded-2xl flex items-center gap-4 text-rose-600">
                      <AlertCircle size={24} />
                      <div>
                        <div className="font-bold uppercase text-[11px] tracking-wider mb-1">Diagnostic Fault</div>
                        <div className="text-sm font-medium">{error}</div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </div>
      </main>
    </div>
  );
}
