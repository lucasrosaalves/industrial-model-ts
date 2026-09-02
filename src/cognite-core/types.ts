/* eslint-disable */
// DO NOT EDIT — this file is auto-generated
// Data model: cdf_cdm/CogniteCore v1

import type {
  AggregateOptions,
  AggregateResult,
  AggregateResultItemForOptions,
  IndustrialModel,
  NodeId,
  QueryOptions,
  QueryResult,
  QueryResultItem,
  QuerySelect,
  UpsertOptions,
  UpsertResult,
} from "../types";

export type Cognite360ImageAnnotation_Status = "Suggested" | "Approved" | "Rejected";
export type Cognite360ImageCollection_Status = "Queued" | "Processing" | "Done" | "Failed";
export type Cognite360ImageCollection_Type = "CAD" | "PointCloud" | "Image360";
export type Cognite360ImageModel_Type = "CAD" | "PointCloud" | "Image360";
export type Cognite360ImageStation_GroupType = "Station360";
export type Cognite3DModel_Type = "CAD" | "PointCloud" | "Image360";
export type Cognite3DRevision_Status = "Queued" | "Processing" | "Done" | "Failed";
export type Cognite3DRevision_Type = "CAD" | "PointCloud" | "Image360";
export type CogniteAnnotation_Status = "Suggested" | "Approved" | "Rejected";
export type CogniteCADModel_Type = "CAD" | "PointCloud" | "Image360";
export type CogniteCADRevision_Status = "Queued" | "Processing" | "Done" | "Failed";
export type CogniteCADRevision_Type = "CAD" | "PointCloud" | "Image360";
export type CogniteDiagramAnnotation_Status = "Suggested" | "Approved" | "Rejected";
export type CognitePointCloudModel_Type = "CAD" | "PointCloud" | "Image360";
export type CognitePointCloudRevision_Status = "Queued" | "Processing" | "Done" | "Failed";
export type CognitePointCloudRevision_Type = "CAD" | "PointCloud" | "Image360";
export type CognitePointCloudVolume_VolumeType = "Cylinder" | "Box";
export type CogniteTimeSeries_Type = "string" | "numeric" | "state";

export type CogniteCoreViewExternalId =
  | "Cognite360Image"
  | "Cognite360ImageAnnotation"
  | "Cognite360ImageCollection"
  | "Cognite360ImageModel"
  | "Cognite360ImageStation"
  | "Cognite3DModel"
  | "Cognite3DObject"
  | "Cognite3DRevision"
  | "Cognite3DTransformation"
  | "CogniteActivity"
  | "CogniteAnnotation"
  | "CogniteAsset"
  | "CogniteAssetClass"
  | "CogniteAssetType"
  | "CogniteCADModel"
  | "CogniteCADNode"
  | "CogniteCADRevision"
  | "CogniteCubeMap"
  | "CogniteDescribable"
  | "CogniteDiagramAnnotation"
  | "CogniteEquipment"
  | "CogniteEquipmentType"
  | "CogniteFile"
  | "CogniteFileCategory"
  | "CognitePointCloudModel"
  | "CognitePointCloudRevision"
  | "CognitePointCloudVolume"
  | "CogniteSchedulable"
  | "CogniteSourceable"
  | "CogniteSourceSystem"
  | "CogniteTimeSeries"
  | "CogniteUnit"
  | "CogniteVisualizable";

export type Cognite360Image = IndustrialModel<
  {
    translationX?: number;
    translationY?: number;
    translationZ?: number;
    eulerRotationX?: number;
    eulerRotationY?: number;
    eulerRotationZ?: number;
    scaleX?: number;
    scaleY?: number;
    scaleZ?: number;
    front?: NodeId;
    back?: NodeId;
    left?: NodeId;
    right?: NodeId;
    top?: NodeId;
    bottom?: NodeId;
    collection360?: NodeId;
    station360?: NodeId;
    takenAt?: Date;
  },
  {
    front?: CogniteFile;
    back?: CogniteFile;
    left?: CogniteFile;
    right?: CogniteFile;
    top?: CogniteFile;
    bottom?: CogniteFile;
    collection360?: Cognite360ImageCollection;
    station360?: Cognite360ImageStation;
  }
>;

export type Cognite360ImageAnnotation = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    sourceId?: string;
    sourceContext?: string;
    source?: NodeId;
    sourceCreatedTime?: Date;
    sourceUpdatedTime?: Date;
    sourceCreatedUser?: string;
    sourceUpdatedUser?: string;
    confidence?: number;
    status?: Cognite360ImageAnnotation_Status;
    polygon?: number[];
    formatVersion?: string;
  },
  {
    source?: CogniteSourceSystem;
  }
>;

export type Cognite360ImageCollection = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    status?: Cognite360ImageCollection_Status;
    published?: boolean;
    type?: Cognite360ImageCollection_Type;
    model3D?: NodeId;
  },
  {
    model3D?: Cognite360ImageModel;
  }
>;

export type Cognite360ImageModel = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    thumbnail?: NodeId;
    type?: Cognite360ImageModel_Type;
  },
  {
    thumbnail?: CogniteFile;
    collections: Cognite360ImageCollection[];
  }
>;

export type Cognite360ImageStation = IndustrialModel<{
  name?: string;
  description?: string;
  tags?: string[];
  aliases?: string[];
  groupType?: Cognite360ImageStation_GroupType;
}>;

export type Cognite3DModel = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    thumbnail?: NodeId;
    type?: Cognite3DModel_Type;
  },
  {
    thumbnail?: CogniteFile;
  }
>;

export type Cognite3DObject = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    xMin?: number;
    xMax?: number;
    yMin?: number;
    yMax?: number;
    zMin?: number;
    zMax?: number;
    images360: NodeId[];
  },
  {
    asset?: CogniteAsset;
    cadNodes: CogniteCADNode[];
    images360: Cognite360Image[];
    pointCloudVolumes: CognitePointCloudVolume[];
  }
>;

export type Cognite3DRevision = IndustrialModel<
  {
    status?: Cognite3DRevision_Status;
    published?: boolean;
    type?: Cognite3DRevision_Type;
    model3D?: NodeId;
  },
  {
    model3D?: Cognite3DModel;
  }
>;

export type Cognite3DTransformation = IndustrialModel<{
  translationX?: number;
  translationY?: number;
  translationZ?: number;
  eulerRotationX?: number;
  eulerRotationY?: number;
  eulerRotationZ?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
}>;

export type CogniteActivity = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    sourceId?: string;
    sourceContext?: string;
    source?: NodeId;
    sourceCreatedTime?: Date;
    sourceUpdatedTime?: Date;
    sourceCreatedUser?: string;
    sourceUpdatedUser?: string;
    startTime?: Date;
    endTime?: Date;
    scheduledStartTime?: Date;
    scheduledEndTime?: Date;
    assets?: NodeId[];
    equipment?: NodeId[];
    timeSeries?: NodeId[];
  },
  {
    source?: CogniteSourceSystem;
    assets?: CogniteAsset[];
    equipment?: CogniteEquipment[];
    timeSeries?: CogniteTimeSeries[];
  }
>;

export type CogniteAnnotation = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    sourceId?: string;
    sourceContext?: string;
    source?: NodeId;
    sourceCreatedTime?: Date;
    sourceUpdatedTime?: Date;
    sourceCreatedUser?: string;
    sourceUpdatedUser?: string;
    confidence?: number;
    status?: CogniteAnnotation_Status;
  },
  {
    source?: CogniteSourceSystem;
  }
>;

export type CogniteAsset = IndustrialModel<
  {
    object3D?: NodeId;
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    sourceId?: string;
    sourceContext?: string;
    source?: NodeId;
    sourceCreatedTime?: Date;
    sourceUpdatedTime?: Date;
    sourceCreatedUser?: string;
    sourceUpdatedUser?: string;
    parent?: NodeId;
    root?: NodeId;
    path?: NodeId[];
    pathLastUpdatedTime?: Date;
    assetClass?: NodeId;
    type?: NodeId;
  },
  {
    object3D?: Cognite3DObject;
    source?: CogniteSourceSystem;
    parent?: CogniteAsset;
    root?: CogniteAsset;
    path?: CogniteAsset[];
    assetClass?: CogniteAssetClass;
    type?: CogniteAssetType;
    children: CogniteAsset[];
    equipment: CogniteEquipment[];
  }
>;

export type CogniteAssetClass = IndustrialModel<{
  name?: string;
  description?: string;
  tags?: string[];
  aliases?: string[];
  code?: string;
  standard?: string;
}>;

export type CogniteAssetType = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    code?: string;
    standard?: string;
    assetClass?: NodeId;
  },
  {
    assetClass?: CogniteAssetClass;
  }
>;

export type CogniteCADModel = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    thumbnail?: NodeId;
    type?: CogniteCADModel_Type;
  },
  {
    thumbnail?: CogniteFile;
    revisions: CogniteCADRevision[];
  }
>;

export type CogniteCADNode = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    object3D?: NodeId;
    model3D?: NodeId;
    cadNodeReference?: string;
    revisions?: NodeId[];
    treeIndexes?: number[];
    subTreeSizes?: number[];
  },
  {
    object3D?: Cognite3DObject;
    model3D?: CogniteCADModel;
    revisions?: CogniteCADRevision[];
  }
>;

export type CogniteCADRevision = IndustrialModel<
  {
    status?: CogniteCADRevision_Status;
    published?: boolean;
    type?: CogniteCADRevision_Type;
    model3D?: NodeId;
    revisionId?: number;
  },
  {
    model3D?: CogniteCADModel;
  }
>;

export type CogniteCubeMap = IndustrialModel<
  {
    front?: NodeId;
    back?: NodeId;
    left?: NodeId;
    right?: NodeId;
    top?: NodeId;
    bottom?: NodeId;
  },
  {
    front?: CogniteFile;
    back?: CogniteFile;
    left?: CogniteFile;
    right?: CogniteFile;
    top?: CogniteFile;
    bottom?: CogniteFile;
  }
>;

export type CogniteDescribable = IndustrialModel<{
  name?: string;
  description?: string;
  tags?: string[];
  aliases?: string[];
}>;

export type CogniteDiagramAnnotation = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    sourceId?: string;
    sourceContext?: string;
    source?: NodeId;
    sourceCreatedTime?: Date;
    sourceUpdatedTime?: Date;
    sourceCreatedUser?: string;
    sourceUpdatedUser?: string;
    confidence?: number;
    status?: CogniteDiagramAnnotation_Status;
    startNodePageNumber?: number;
    endNodePageNumber?: number;
    startNodeXMin?: number;
    startNodeXMax?: number;
    startNodeYMin?: number;
    startNodeYMax?: number;
    startNodeText?: string;
    endNodeXMin?: number;
    endNodeXMax?: number;
    endNodeYMin?: number;
    endNodeYMax?: number;
    endNodeText?: string;
  },
  {
    source?: CogniteSourceSystem;
  }
>;

export type CogniteEquipment = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    sourceId?: string;
    sourceContext?: string;
    source?: NodeId;
    sourceCreatedTime?: Date;
    sourceUpdatedTime?: Date;
    sourceCreatedUser?: string;
    sourceUpdatedUser?: string;
    asset?: NodeId;
    serialNumber?: string;
    manufacturer?: string;
    equipmentType?: NodeId;
    files?: NodeId[];
  },
  {
    source?: CogniteSourceSystem;
    asset?: CogniteAsset;
    equipmentType?: CogniteEquipmentType;
    files?: CogniteFile[];
  }
>;

export type CogniteEquipmentType = IndustrialModel<{
  name?: string;
  description?: string;
  tags?: string[];
  aliases?: string[];
  code?: string;
  equipmentClass?: string;
  standard?: string;
  standardReference?: string;
}>;

export type CogniteFile = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    sourceId?: string;
    sourceContext?: string;
    source?: NodeId;
    sourceCreatedTime?: Date;
    sourceUpdatedTime?: Date;
    sourceCreatedUser?: string;
    sourceUpdatedUser?: string;
    assets?: NodeId[];
    mimeType?: string;
    directory?: string;
    isUploaded?: boolean;
    uploadedTime?: Date;
    category?: NodeId;
  },
  {
    source?: CogniteSourceSystem;
    assets?: CogniteAsset[];
    category?: CogniteFileCategory;
  }
>;

export type CogniteFileCategory = IndustrialModel<{
  name?: string;
  description?: string;
  tags?: string[];
  aliases?: string[];
  code: string;
  standard?: string;
  standardReference?: string;
}>;

export type CognitePointCloudModel = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    thumbnail?: NodeId;
    type?: CognitePointCloudModel_Type;
  },
  {
    thumbnail?: CogniteFile;
    revisions: CognitePointCloudRevision[];
  }
>;

export type CognitePointCloudRevision = IndustrialModel<
  {
    status?: CognitePointCloudRevision_Status;
    published?: boolean;
    type?: CognitePointCloudRevision_Type;
    model3D?: NodeId;
    revisionId?: number;
  },
  {
    model3D?: CognitePointCloudModel;
  }
>;

export type CognitePointCloudVolume = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    object3D?: NodeId;
    model3D?: NodeId;
    volumeReferences?: string[];
    revisions?: NodeId[];
    volumeType?: CognitePointCloudVolume_VolumeType;
    volume?: number[];
    formatVersion?: string;
  },
  {
    object3D?: Cognite3DObject;
    model3D?: CogniteCADModel;
    revisions?: CogniteCADRevision[];
  }
>;

export type CogniteSchedulable = IndustrialModel<{
  startTime?: Date;
  endTime?: Date;
  scheduledStartTime?: Date;
  scheduledEndTime?: Date;
}>;

export type CogniteSourceable = IndustrialModel<
  {
    sourceId?: string;
    sourceContext?: string;
    source?: NodeId;
    sourceCreatedTime?: Date;
    sourceUpdatedTime?: Date;
    sourceCreatedUser?: string;
    sourceUpdatedUser?: string;
  },
  {
    source?: CogniteSourceSystem;
  }
>;

export type CogniteSourceSystem = IndustrialModel<{
  name?: string;
  description?: string;
  tags?: string[];
  aliases?: string[];
  version?: string;
  manufacturer?: string;
}>;

export type CogniteTimeSeries = IndustrialModel<
  {
    name?: string;
    description?: string;
    tags?: string[];
    aliases?: string[];
    sourceId?: string;
    sourceContext?: string;
    source?: NodeId;
    sourceCreatedTime?: Date;
    sourceUpdatedTime?: Date;
    sourceCreatedUser?: string;
    sourceUpdatedUser?: string;
    isStep: boolean;
    type: CogniteTimeSeries_Type;
    sourceUnit?: string;
    unit?: NodeId;
    assets?: NodeId[];
    equipment?: NodeId[];
    stateSet?: NodeId;
  },
  {
    source?: CogniteSourceSystem;
    unit?: CogniteUnit;
    assets?: CogniteAsset[];
    equipment?: CogniteEquipment[];
  }
>;

export type CogniteUnit = IndustrialModel<{
  name?: string;
  description?: string;
  tags?: string[];
  aliases?: string[];
  symbol?: string;
  quantity?: string;
  source?: string;
  sourceReference?: string;
}>;

export type CogniteVisualizable = IndustrialModel<
  {
    object3D?: NodeId;
  },
  {
    object3D?: Cognite3DObject;
  }
>;

export interface CogniteCoreModelByView {
  Cognite360Image: Cognite360Image;
  Cognite360ImageAnnotation: Cognite360ImageAnnotation;
  Cognite360ImageCollection: Cognite360ImageCollection;
  Cognite360ImageModel: Cognite360ImageModel;
  Cognite360ImageStation: Cognite360ImageStation;
  Cognite3DModel: Cognite3DModel;
  Cognite3DObject: Cognite3DObject;
  Cognite3DRevision: Cognite3DRevision;
  Cognite3DTransformation: Cognite3DTransformation;
  CogniteActivity: CogniteActivity;
  CogniteAnnotation: CogniteAnnotation;
  CogniteAsset: CogniteAsset;
  CogniteAssetClass: CogniteAssetClass;
  CogniteAssetType: CogniteAssetType;
  CogniteCADModel: CogniteCADModel;
  CogniteCADNode: CogniteCADNode;
  CogniteCADRevision: CogniteCADRevision;
  CogniteCubeMap: CogniteCubeMap;
  CogniteDescribable: CogniteDescribable;
  CogniteDiagramAnnotation: CogniteDiagramAnnotation;
  CogniteEquipment: CogniteEquipment;
  CogniteEquipmentType: CogniteEquipmentType;
  CogniteFile: CogniteFile;
  CogniteFileCategory: CogniteFileCategory;
  CognitePointCloudModel: CognitePointCloudModel;
  CognitePointCloudRevision: CognitePointCloudRevision;
  CognitePointCloudVolume: CognitePointCloudVolume;
  CogniteSchedulable: CogniteSchedulable;
  CogniteSourceable: CogniteSourceable;
  CogniteSourceSystem: CogniteSourceSystem;
  CogniteTimeSeries: CogniteTimeSeries;
  CogniteUnit: CogniteUnit;
  CogniteVisualizable: CogniteVisualizable;
}

export type CogniteCoreModel<TView extends CogniteCoreViewExternalId> =
  CogniteCoreModelByView[TView];

export type CogniteCoreQueryExecutor<TView extends CogniteCoreViewExternalId> = {
  <const TSelect extends QuerySelect<CogniteCoreModel<TView>>>(
    options: Omit<QueryOptions<CogniteCoreModel<TView>, TSelect>, "viewExternalId" | "select"> & {
      select: TSelect & QuerySelect<CogniteCoreModel<TView>>;
    },
  ): Promise<QueryResult<QueryResultItem<CogniteCoreModel<TView>, TSelect>>>;
  (
    options?: Omit<
      QueryOptions<CogniteCoreModel<TView>, undefined>,
      "viewExternalId" | "select"
    > & {
      select?: undefined;
    },
  ): Promise<QueryResult<QueryResultItem<CogniteCoreModel<TView>, undefined>>>;
};

export type CogniteCoreAggregateExecutor<TView extends CogniteCoreViewExternalId> = <
  const TOptions extends Omit<AggregateOptions<CogniteCoreModel<TView>>, "viewExternalId">,
>(
  options?: TOptions,
) => Promise<
  AggregateResult<
    AggregateResultItemForOptions<CogniteCoreModel<TView>, TOptions & { viewExternalId: TView }>
  >
>;

export type CogniteCoreUpsertExecutor<TView extends CogniteCoreViewExternalId> = (
  options: Omit<UpsertOptions<CogniteCoreModel<TView>>, "viewExternalId">,
) => Promise<UpsertResult>;
