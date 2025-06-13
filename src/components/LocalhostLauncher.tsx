
"use client";

import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FolderOpen, Play, Square, AlertTriangle, ExternalLink, Server } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

// This interface is needed for File System Access API types
interface FileSystemDirectoryHandle {
  kind: 'directory';
  name: string;
  entries: () => AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
  values: () => AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FileSystemFileHandle>;
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<FileSystemDirectoryHandle>;
  // There are more methods, but these are the core ones used here
}

interface FileSystemFileHandle {
  kind: 'file';
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<FileSystemWritableFileStream>;
}

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  }
}

export default function LocalhostLauncher() {
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [port, setPort] = useState<string>("8080");
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("Server is stopped.");
  const [serverUrl, setServerUrl] = useState<string>("");
  const [iframeSrcDoc, setIframeSrcDoc] = useState<string | null>(null);
  const [supportsFSAPI, setSupportsFSAPI] = useState<boolean | undefined>(undefined);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const { toast } = useToast();

  useEffect(() => {
    setSupportsFSAPI(typeof window !== 'undefined' && 'showDirectoryPicker' in window);
  }, []);

  const handleSelectDirectory = async () => {
    if (!supportsFSAPI) {
      toast({
        title: "Browser Not Supported",
        description: "Your browser doesn't support the File System Access API needed for directory selection. Please use a modern browser like Chrome or Edge.",
        variant: "destructive",
      });
      return;
    }
    try {
      const handle = await window.showDirectoryPicker!();
      setDirectoryHandle(handle);
      setSelectedPath(handle.name);
      setIsRunning(false);
      setIframeSrcDoc(null);
      setStatusMessage("Directory selected. Server is stopped.");
      toast({ title: "Directory Selected", description: `Selected directory: ${handle.name}` });
    } catch (err) {
      console.error("Error selecting directory:", err);
      if ((err as Error).name !== 'AbortError') {
        toast({ title: "Error", description: "Could not select directory.", variant: "destructive" });
      }
    }
  };

  const handlePortChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newPort = e.target.value;
    if (/^\d*$/.test(newPort) && parseInt(newPort, 10) <= 65535) {
      setPort(newPort);
    }
  };

  const handleStartServer = async () => {
    if (!directoryHandle) {
      toast({ title: "Error", description: "Please select a directory first.", variant: "destructive" });
      return;
    }
    if (!port || parseInt(port, 10) <= 0 || parseInt(port, 10) > 65535) {
      toast({ title: "Error", description: "Please enter a valid port number (1-65535).", variant: "destructive" });
      return;
    }

    setIsRunning(true);
    const currentServerUrl = `http://localhost:${port}`;
    setServerUrl(currentServerUrl);
    let currentStatusMessage = `Server running at ${currentServerUrl}`;

    try {
      let indexHtmlFound = false;
      for await (const entry of directoryHandle.values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase() === 'index.html') {
          const fileHandle = entry as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          const text = await file.text();
          setIframeSrcDoc(text);
          currentStatusMessage += " (Previewing index.html)";
          indexHtmlFound = true;
          break;
        }
      }
      if (!indexHtmlFound) {
        setIframeSrcDoc(null);
        currentStatusMessage += ". No index.html found in the root of the selected directory to preview.";
      }
    } catch (err) {
      console.error("Error reading index.html:", err);
      setIframeSrcDoc(null);
      currentStatusMessage += ". Error reading index.html for preview.";
      toast({ title: "Preview Error", description: "Could not read index.html for preview.", variant: "destructive"});
    }
    
    setStatusMessage(currentStatusMessage);
    toast({ title: "Server Started (Simulated)", description: `Serving from ${selectedPath} on port ${port}.`});
  };

  const handleStopServer = () => {
    setIsRunning(false);
    setStatusMessage("Server is stopped.");
    setServerUrl("");
    setIframeSrcDoc(null);
    // Optionally clear directory on stop, or keep it for next start
    // setDirectoryHandle(null); 
    // setSelectedPath(null);
    toast({ title: "Server Stopped (Simulated)" });
  };
  
  // Adjust iframe height
  useEffect(() => {
    if (isRunning && iframeSrcDoc && iframeRef.current) {
        // Basic auto-height, might need more sophisticated solution for complex content
        const resizeObserver = new ResizeObserver(entries => {
            if (iframeRef.current && iframeRef.current.contentWindow && iframeRef.current.contentWindow.document.body) {
                iframeRef.current.style.height = iframeRef.current.contentWindow.document.body.scrollHeight + 'px';
            }
        });
        
        const attemptResize = () => {
           if (iframeRef.current && iframeRef.current.contentWindow && iframeRef.current.contentWindow.document.body) {
                iframeRef.current.style.height = iframeRef.current.contentWindow.document.body.scrollHeight + 'px';
                resizeObserver.observe(iframeRef.current.contentWindow.document.body);
            }
        };

        const currentIframe = iframeRef.current;
        currentIframe.onload = attemptResize; // Ensure content is loaded
        // Initial attempt
        attemptResize();


        return () => {
            if (currentIframe && currentIframe.contentWindow && currentIframe.contentWindow.document.body) {
                 resizeObserver.unobserve(currentIframe.contentWindow.document.body);
            }
            resizeObserver.disconnect();
            if(currentIframe) currentIframe.onload = null;
        };
    }
  }, [isRunning, iframeSrcDoc]);


  if (supportsFSAPI === undefined) {
    return <div className="flex justify-center items-center h-screen"><p>Loading...</p></div>;
  }

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-3xl">
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-3xl font-headline text-primary flex items-center">
            <Server size={32} className="mr-3" /> Localhost Launcher
          </CardTitle>
          <CardDescription>
            Select a directory and port to simulate a local HTTP server.
            This tool uses the File System Access API, available in modern browsers like Chrome and Edge.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!supportsFSAPI && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Browser Not Supported</AlertTitle>
              <AlertDescription>
                Your browser does not support the File System Access API, which is required for this application to function.
                Please try using a recent version of Google Chrome or Microsoft Edge.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="directory" className="text-lg">Directory</Label>
            <div className="flex items-center space-x-3">
              <Button onClick={handleSelectDirectory} disabled={!supportsFSAPI} variant="outline">
                <FolderOpen className="mr-2 h-5 w-5" /> Select Directory
              </Button>
              {selectedPath && <span className="text-sm text-muted-foreground italic p-2 border rounded-md bg-secondary/50">{selectedPath}</span>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="port" className="text-lg">Port</Label>
            <Input 
              id="port" 
              type="number" 
              value={port} 
              onChange={handlePortChange} 
              placeholder="e.g., 8080" 
              className="w-40"
              min="1"
              max="65535"
              disabled={!supportsFSAPI}
            />
          </div>

          <div className="flex space-x-4">
            <Button 
              onClick={handleStartServer} 
              disabled={isRunning || !directoryHandle || !supportsFSAPI}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Play className="mr-2 h-5 w-5" /> Start Server
            </Button>
            <Button 
              onClick={handleStopServer} 
              disabled={!isRunning || !supportsFSAPI} 
              variant="destructive"
            >
              <Square className="mr-2 h-5 w-5" /> Stop Server
            </Button>
          </div>
        </CardContent>
        <CardFooter className="flex-col items-start space-y-3">
          <h3 className="text-xl font-semibold font-headline">Server Status</h3>
          <div 
            className={`p-3 rounded-md w-full transition-all duration-300 ease-in-out ${
              isRunning ? 'bg-accent/20 border-accent' : 'bg-muted border-muted-foreground/30'
            }`}
          >
            <p 
              className={`text-sm font-medium ${
                isRunning ? 'text-accent-foreground animate-status-pulse' : 'text-muted-foreground'
              } ${isRunning && 'bg-accent p-2 rounded-md'}`}
            >
              {statusMessage}
            </p>
            {isRunning && serverUrl && (
              <p className="text-xs mt-1">
                Actual local server command for CLI: 
                <code className="ml-1 bg-gray-200 text-gray-700 px-1 py-0.5 rounded text-xs">
                  npx http-server "{selectedPath}" -p {port}
                </code>
                 <Button variant="link" size="sm" asChild className="p-0 h-auto ml-1">
                   <a href={`https://www.npmjs.com/package/http-server`} target="_blank" rel="noopener noreferrer" className="text-xs">
                     (Requires Node.js and http-server) <ExternalLink size={12} className="inline-block ml-1"/>
                   </a>
                 </Button>
              </p>
            )}
          </div>
          
          {isRunning && iframeSrcDoc && (
            <div className="w-full mt-4 p-4 border rounded-lg shadow-inner bg-card">
              <h4 className="text-lg font-semibold mb-2">Preview (index.html):</h4>
              <iframe
                ref={iframeRef}
                srcDoc={iframeSrcDoc}
                title="Local Content Preview"
                className="w-full min-h-[300px] border border-border rounded-md resize-y overflow-auto"
                sandbox="allow-scripts" // Be cautious with this if files are untrusted. For local files, it's usually fine.
                                       // Removed allow-same-origin for better security. This will break relative asset loading.
                                       // This is a known limitation of simple srcDoc previews.
              />
              <p className="text-xs text-muted-foreground mt-2">
                Note: This preview renders the HTML content of 'index.html'. Relative paths to assets (CSS, JS, images) within the HTML may not load correctly in this sandboxed preview. For full functionality, use a command-line HTTP server.
              </p>
            </div>
          )}
          {isRunning && !iframeSrcDoc && directoryHandle && (
             <Alert variant="default" className="mt-4">
                <AlertTriangle className="h-4 w-4"/>
                <AlertTitle>No Preview Available</AlertTitle>
                <AlertDescription>
                  {statusMessage.includes("No index.html found") ? "No 'index.html' was found in the root of the selected directory to preview." : "An error occurred while trying to load 'index.html' for preview."}
                  <br/>
                  To serve all files from '{selectedPath}', you would typically run a command-line HTTP server.
                </AlertDescription>
            </Alert>
          )}

        </CardFooter>
      </Card>
    </div>
  );
}
