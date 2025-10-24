"use client";

import { useEffect, useState } from "react";
import { Image } from "@/lib/glance";
import AddImageModal from "@/components/AddImageModal";

export default function ImagesPage() {
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const fetchImages = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/images");
      if (!response.ok) {
        throw new Error(`Failed to fetch images: ${response.statusText}`);
      }

      const data = await response.json();
      setImages(data);
    } catch (err) {
      console.error("Failed to fetch images:", err);
      setError("Failed to load images");
    } finally {
      setLoading(false);
    }
  };

  const handleImageAdded = () => {
    // Refresh the images list
    fetchImages();
  };

  useEffect(() => {
    fetchImages();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <span className="ml-2 text-gray-600">Loading images...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error loading images</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold leading-6 text-gray-900">Images</h1>
          <p className="mt-2 text-sm text-gray-700">
            Manage your OpenStack images
          </p>
        </div>
        <div className="sm:flex-none">
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="block rounded-md bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Add Image
          </button>
        </div>
      </div>

      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-md">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                      Name
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Visibility
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Size
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Format
                    </th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {images.map((image) => (
                    <tr key={image.id}>
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                        {image.name}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${
                          image.status === 'active'
                            ? 'bg-green-50 text-green-700'
                            : image.status === 'saving'
                            ? 'bg-yellow-50 text-yellow-700'
                            : 'bg-gray-50 text-gray-700'
                        }`}>
                          {image.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {image.visibility}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {image.size ? `${(image.size / (1024 * 1024 * 1024)).toFixed(2)} GB` : 'N/A'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {image.disk_format}
                      </td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <button className="text-indigo-600 hover:text-indigo-900 mr-4">
                          Edit
                        </button>
                        <button className="text-red-600 hover:text-red-900">
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {images.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No images found</p>
        </div>
      )}

      <AddImageModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onImageAdded={handleImageAdded}
      />
    </div>
  );
}